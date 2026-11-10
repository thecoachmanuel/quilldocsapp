import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

declare global {
  // eslint-disable-next-line no-var
  var cachedPrisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var cachedLocalDb: any | undefined;
}

const isDatabaseConfigured = Boolean(
  process.env.DATABASE_URL &&
    process.env.DATABASE_URL.trim() !== "" &&
    !process.env.DATABASE_URL.includes("<user>")
);

export const DEFAULT_PLAN_CONFIGS = [
  {
    id: "plan_free",
    slug: "free",
    name: "Free",
    tagline: "For small side projects and quick study notes.",
    price: 0,
    priceNgn: 0,
    quota: 10,
    pagesPerPdf: 5,
    maxFileSizeMB: 4,
    features: [
      "5 pages per PDF / Slide",
      "4MB file size limit",
      "Mobile-friendly interface",
      "Standard-quality AI responses",
    ],
    isPopular: false,
    stripePriceId: "",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "plan_pro",
    slug: "pro",
    name: "Pro",
    tagline: "For larger research projects, theses, and higher needs.",
    price: 14,
    priceNgn: 18000,
    quota: 50,
    pagesPerPdf: 25,
    maxFileSizeMB: 16,
    features: [
      "25 pages per PDF / Slide",
      "16MB file size limit",
      "Mobile-friendly interface",
      "High-precision 4x context responses",
      "Study guides & exam mock questions",
      "Priority customer support",
    ],
    isPopular: true,
    stripePriceId: "price_1OQrcuKMJjiqL9lYEEU1nxSz",
    updatedAt: new Date().toISOString(),
  },
];

export const DEFAULT_CONTACT_INFO = {
  id: "default",
  email: "support@quilldocs.com",
  phone: "+2347038587375",
  address: "Lagos, Nigeria",
  hours: "Monday - Friday: 9:00 AM - 6:00 PM (UTC+1)",
  updatedAt: new Date().toISOString(),
};

interface LocalStore {
  users: any[];
  files: any[];
  messages: any[];
  planConfigs: any[];
  contactMessages: any[];
  contactInfo: any;
}

function createLocalDb() {
  const dbFile = path.join(process.cwd(), ".quill_local_db.json");

  function readStore(): LocalStore {
    try {
      if (!fs.existsSync(dbFile)) {
        const initial: LocalStore = {
          users: [],
          files: [],
          messages: [],
          planConfigs: DEFAULT_PLAN_CONFIGS,
          contactMessages: [],
          contactInfo: DEFAULT_CONTACT_INFO,
        };
        fs.writeFileSync(dbFile, JSON.stringify(initial, null, 2));
        return initial;
      }
      const data = fs.readFileSync(dbFile, "utf-8");
      const parsed = JSON.parse(data);
      let needsWrite = false;

      if (!Array.isArray(parsed.users)) {
        parsed.users = [];
        needsWrite = true;
      }
      if (!Array.isArray(parsed.files)) {
        parsed.files = [];
        needsWrite = true;
      }
      if (!Array.isArray(parsed.messages)) {
        parsed.messages = [];
        needsWrite = true;
      }
      if (!Array.isArray(parsed.planConfigs) || parsed.planConfigs.length === 0) {
        parsed.planConfigs = DEFAULT_PLAN_CONFIGS;
        needsWrite = true;
      }
      if (!Array.isArray(parsed.contactMessages)) {
        parsed.contactMessages = [];
        needsWrite = true;
      }
      if (!parsed.contactInfo || !parsed.contactInfo.email) {
        parsed.contactInfo = DEFAULT_CONTACT_INFO;
        needsWrite = true;
      }

      if (needsWrite) {
        fs.writeFileSync(dbFile, JSON.stringify(parsed, null, 2));
      }
      return parsed;
    } catch {
      return {
        users: [],
        files: [],
        messages: [],
        planConfigs: DEFAULT_PLAN_CONFIGS,
        contactMessages: [],
        contactInfo: DEFAULT_CONTACT_INFO,
      };
    }
  }

  function writeStore(store: LocalStore) {
    try {
      fs.writeFileSync(dbFile, JSON.stringify(store, null, 2));
    } catch (err) {
      console.error("Failed to write to local db:", err);
    }
  }

  return {
    __version: 3,
    user: {
      findFirst: async ({ where }: { where?: any } = {}) => {
        const store = readStore();
        if (!where) return store.users[0] || null;
        return (
          store.users.find((u) => {
            if (where.id && u.id !== where.id) return false;
            if (where.email && u.email?.toLowerCase() !== where.email?.toLowerCase())
              return false;
            if (where.role && (u.role || "USER") !== where.role) return false;
            if (
              where.stripeCustomerId &&
              u.stripeCustomerId !== where.stripeCustomerId
            )
              return false;
            return true;
          }) || null
        );
      },
      findUnique: async ({ where }: { where: any }) => {
        const store = readStore();
        return (
          store.users.find((u) => {
            if (where.id && u.id !== where.id) return false;
            if (where.email && u.email?.toLowerCase() !== where.email?.toLowerCase())
              return false;
            if (
              where.stripeCustomerId &&
              u.stripeCustomerId !== where.stripeCustomerId
            )
              return false;
            return true;
          }) || null
        );
      },
      findMany: async ({
        where,
        orderBy,
      }: {
        where?: any;
        orderBy?: any;
      } = {}) => {
        const store = readStore();
        let results = store.users.filter((u) => {
          if (where?.role && (u.role || "USER") !== where.role) return false;
          if (where?.status && (u.status || "ACTIVE") !== where.status)
            return false;
          return true;
        });
        if (orderBy?.createdAt) {
          results.sort((a, b) => {
            const timeA = new Date(a.createdAt || 0).getTime();
            const timeB = new Date(b.createdAt || 0).getTime();
            return orderBy.createdAt === "desc" ? timeB - timeA : timeA - timeB;
          });
        }
        return results;
      },
      create: async ({ data }: { data: any }) => {
        const store = readStore();
        const existing = store.users.find(
          (u) =>
            u.id === data.id ||
            (data.email && u.email?.toLowerCase() === data.email?.toLowerCase())
        );
        if (existing) {
          Object.assign(existing, {
            ...data,
            role: data.role || existing.role || "USER",
            status: data.status || existing.status || "ACTIVE",
            updatedAt: new Date().toISOString(),
          });
          writeStore(store);
          return existing;
        }
        const newUser = {
          id: data.id || `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          email: data.email,
          name: data.name || null,
          role: data.role || "USER",
          status: data.status || "ACTIVE",
          stripeCustomerId: data.stripeCustomerId || null,
          stripeSubscriptionId: data.stripeSubscriptionId || null,
          stripePriceId: data.stripePriceId || null,
          stripeCurrentPeriodEnd: data.stripeCurrentPeriodEnd || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        store.users.push(newUser);
        writeStore(store);
        return newUser;
      },
      update: async ({ where, data }: { where: any; data: any }) => {
        const store = readStore();
        const user = store.users.find((u) => {
          if (where.id && u.id === where.id) return true;
          if (where.email && u.email?.toLowerCase() === where.email?.toLowerCase())
            return true;
          if (
            where.stripeCustomerId &&
            u.stripeCustomerId === where.stripeCustomerId
          )
            return true;
          if (
            where.stripeSubscriptionId &&
            u.stripeSubscriptionId === where.stripeSubscriptionId
          )
            return true;
          return false;
        });
        if (!user) {
          throw new Error("User record to update not found.");
        }
        Object.assign(user, data, { updatedAt: new Date().toISOString() });
        writeStore(store);
        return user;
      },
      delete: async ({ where }: { where: any }) => {
        const store = readStore();
        const index = store.users.findIndex(
          (u) => u.id === where.id || (where.email && u.email === where.email)
        );
        if (index === -1) throw new Error("User record to delete not found.");
        const [deleted] = store.users.splice(index, 1);
        const userFileIds = store.files
          .filter((f) => f.userId === deleted.id)
          .map((f) => f.id);
        store.files = store.files.filter((f) => f.userId !== deleted.id);
        store.messages = store.messages.filter(
          (m) => m.userId !== deleted.id && !userFileIds.includes(m.fileId)
        );
        writeStore(store);
        return deleted;
      },
      count: async ({ where }: { where?: any } = {}) => {
        const store = readStore();
        if (!where) return store.users.length;
        return store.users.filter((u) => {
          if (where.role && (u.role || "USER") !== where.role) return false;
          if (where.status && (u.status || "ACTIVE") !== where.status)
            return false;
          return true;
        }).length;
      },
    },
    file: {
      findFirst: async ({ where }: { where?: any } = {}) => {
        const store = readStore();
        if (!where) return store.files[0] || null;
        return (
          store.files.find((f) => {
            if (where.id && f.id !== where.id) return false;
            if (where.key && f.key !== where.key) return false;
            if (where.userId && f.userId !== where.userId) return false;
            return true;
          }) || null
        );
      },
      findMany: async ({
        where,
        orderBy,
      }: {
        where?: any;
        orderBy?: any;
      } = {}) => {
        const store = readStore();
        let results = store.files.filter((f) => {
          if (where?.userId && f.userId !== where.userId) return false;
          if (where?.uploadStatus && f.uploadStatus !== where.uploadStatus)
            return false;
          return true;
        });
        if (orderBy?.createdAt) {
          results.sort((a, b) => {
            const timeA = new Date(a.createdAt || 0).getTime();
            const timeB = new Date(b.createdAt || 0).getTime();
            return orderBy.createdAt === "desc" ? timeB - timeA : timeA - timeB;
          });
        }
        return results;
      },
      create: async ({ data }: { data: any }) => {
        const store = readStore();
        const newFile = {
          id:
            data.id ||
            `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: data.name,
          uploadStatus: data.uploadStatus || "PENDING",
          url: data.url,
          key: data.key,
          userId: data.userId || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        store.files.push(newFile);
        writeStore(store);
        return newFile;
      },
      update: async ({ where, data }: { where: any; data: any }) => {
        const store = readStore();
        const file = store.files.find(
          (f) => f.id === where.id || (where.key && f.key === where.key)
        );
        if (!file) throw new Error("Record to update not found.");
        Object.assign(file, data, { updatedAt: new Date().toISOString() });
        writeStore(store);
        return file;
      },
      delete: async ({ where }: { where: any }) => {
        const store = readStore();
        const index = store.files.findIndex((f) => f.id === where.id);
        if (index === -1) throw new Error("Record to delete not found.");
        const [deleted] = store.files.splice(index, 1);
        store.messages = store.messages.filter((m) => m.fileId !== where.id);
        writeStore(store);
        return deleted;
      },
      count: async ({ where }: { where?: any } = {}) => {
        const store = readStore();
        if (!where) return store.files.length;
        return store.files.filter((f) => {
          if (where.userId && f.userId !== where.userId) return false;
          if (where.uploadStatus && f.uploadStatus !== where.uploadStatus)
            return false;
          return true;
        }).length;
      },
    },
    message: {
      findMany: async ({
        where,
        take,
        skip = 0,
        cursor,
        orderBy,
      }: {
        where?: any;
        take?: number;
        skip?: number;
        cursor?: any;
        orderBy?: any;
      } = {}) => {
        const store = readStore();
        let results = store.messages.filter((m) => {
          if (where?.fileId && m.fileId !== where.fileId) return false;
          if (where?.userId && m.userId !== where.userId) return false;
          return true;
        });

        if (orderBy?.createdAt) {
          results.sort((a, b) => {
            const timeA = new Date(a.createdAt || 0).getTime();
            const timeB = new Date(b.createdAt || 0).getTime();
            return orderBy.createdAt === "desc" ? timeB - timeA : timeA - timeB;
          });
        }

        if (cursor?.id) {
          const cursorIndex = results.findIndex((m) => m.id === cursor.id);
          if (cursorIndex !== -1) {
            results = results.slice(cursorIndex + skip);
          }
        } else if (skip) {
          results = results.slice(skip);
        }

        if (take) {
          results = results.slice(0, take);
        }

        return results;
      },
      create: async ({ data }: { data: any }) => {
        const store = readStore();
        const newMessage = {
          id:
            data.id ||
            `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          text: data.text,
          isUserMessage: Boolean(data.isUserMessage),
          userId: data.userId || null,
          fileId: data.fileId || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        store.messages.push(newMessage);
        writeStore(store);
        return newMessage;
      },
      count: async ({ where }: { where?: any } = {}) => {
        const store = readStore();
        if (!where) return store.messages.length;
        return store.messages.filter((m) => {
          if (where.fileId && m.fileId !== where.fileId) return false;
          if (where.userId && m.userId !== where.userId) return false;
          return true;
        }).length;
      },
      deleteMany: async ({ where }: { where?: any } = {}) => {
        const store = readStore();
        const before = store.messages.length;
        store.messages = store.messages.filter((m) => {
          if (where?.fileId && m.fileId === where.fileId) return false;
          if (where?.userId && m.userId === where.userId) return false;
          return true;
        });
        writeStore(store);
        return { count: before - store.messages.length };
      },
    },
    planConfig: {
      findMany: async () => {
        const store = readStore();
        return [...store.planConfigs].sort((a, b) => a.price - b.price);
      },
      findFirst: async ({ where }: { where?: any } = {}) => {
        const store = readStore();
        if (!where) return store.planConfigs[0] || null;
        return (
          store.planConfigs.find((p) => {
            if (where.id && p.id !== where.id) return false;
            if (where.slug && p.slug !== where.slug) return false;
            if (where.name && p.name.toLowerCase() !== where.name.toLowerCase())
              return false;
            return true;
          }) || null
        );
      },
      findUnique: async ({ where }: { where: any }) => {
        const store = readStore();
        return (
          store.planConfigs.find((p) => {
            if (where.id && p.id !== where.id) return false;
            if (where.slug && p.slug !== where.slug) return false;
            return true;
          }) || null
        );
      },
      create: async ({ data }: { data: any }) => {
        const store = readStore();
        const newPlan = {
          id: data.id || `plan_${data.slug || Date.now()}`,
          slug: (data.slug || data.name || "custom")
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-"),
          name: data.name,
          tagline: data.tagline || "",
          price: Number(data.price) || 0,
          priceNgn: Number(data.priceNgn) || 0,
          quota: Number(data.quota) || 10,
          pagesPerPdf: Number(data.pagesPerPdf) || 5,
          maxFileSizeMB: Number(data.maxFileSizeMB) || 4,
          features: Array.isArray(data.features) ? data.features : [],
          isPopular: Boolean(data.isPopular),
          stripePriceId: data.stripePriceId || "",
          updatedAt: new Date().toISOString(),
        };
        store.planConfigs.push(newPlan);
        writeStore(store);
        return newPlan;
      },
      update: async ({ where, data }: { where: any; data: any }) => {
        const store = readStore();
        const plan = store.planConfigs.find(
          (p) =>
            (where.id && p.id === where.id) ||
            (where.slug && p.slug === where.slug)
        );
        if (!plan) throw new Error("Plan record to update not found.");
        Object.assign(plan, data, { updatedAt: new Date().toISOString() });
        writeStore(store);
        return plan;
      },
      upsert: async ({
        where,
        update,
        create,
      }: {
        where: any;
        update: any;
        create: any;
      }) => {
        const store = readStore();
        const existing = store.planConfigs.find(
          (p) =>
            (where.id && p.id === where.id) ||
            (where.slug && p.slug === where.slug)
        );
        if (existing) {
          Object.assign(existing, update, {
            updatedAt: new Date().toISOString(),
          });
          writeStore(store);
          return existing;
        }
        const created = {
          id: create.id || `plan_${create.slug || Date.now()}`,
          ...create,
          updatedAt: new Date().toISOString(),
        };
        store.planConfigs.push(created);
        writeStore(store);
        return created;
      },
      delete: async ({ where }: { where: any }) => {
        const store = readStore();
        const index = store.planConfigs.findIndex(
          (p) =>
            (where.id && p.id === where.id) ||
            (where.slug && p.slug === where.slug)
        );
        if (index === -1) throw new Error("Plan record to delete not found.");
        const [deleted] = store.planConfigs.splice(index, 1);
        writeStore(store);
        return deleted;
      },
      resetDefaults: async () => {
        const store = readStore();
        store.planConfigs = DEFAULT_PLAN_CONFIGS.map((p) => ({
          ...p,
          updatedAt: new Date().toISOString(),
        }));
        writeStore(store);
        return store.planConfigs;
      },
    },
    contactMessage: {
      findMany: async ({
        where,
        orderBy,
      }: { where?: any; orderBy?: any } = {}) => {
        const store = readStore();
        let results = [...store.contactMessages];
        if (where?.status) {
          results = results.filter((m) => m.status === where.status);
        }
        if (orderBy?.createdAt) {
          results.sort((a, b) => {
            const timeA = new Date(a.createdAt || 0).getTime();
            const timeB = new Date(b.createdAt || 0).getTime();
            return orderBy.createdAt === "desc" ? timeB - timeA : timeA - timeB;
          });
        }
        return results;
      },
      findUnique: async ({ where }: { where: any }) => {
        const store = readStore();
        return store.contactMessages.find((m) => m.id === where.id) || null;
      },
      create: async ({ data }: { data: any }) => {
        const store = readStore();
        const newMsg = {
          id:
            data.id ||
            `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: data.name,
          email: data.email,
          subject: data.subject || "General Inquiry",
          message: data.message,
          status: data.status || "UNREAD",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        store.contactMessages.unshift(newMsg);
        writeStore(store);
        return newMsg;
      },
      update: async ({ where, data }: { where: any; data: any }) => {
        const store = readStore();
        const msg = store.contactMessages.find((m) => m.id === where.id);
        if (!msg) throw new Error("Contact message not found");
        Object.assign(msg, data, { updatedAt: new Date().toISOString() });
        writeStore(store);
        return msg;
      },
      delete: async ({ where }: { where: any }) => {
        const store = readStore();
        const idx = store.contactMessages.findIndex((m) => m.id === where.id);
        if (idx === -1) throw new Error("Contact message not found");
        const [deleted] = store.contactMessages.splice(idx, 1);
        writeStore(store);
        return deleted;
      },
      count: async ({ where }: { where?: any } = {}) => {
        const store = readStore();
        if (!where) return store.contactMessages.length;
        return store.contactMessages.filter((m) => {
          if (where.status && m.status !== where.status) return false;
          return true;
        }).length;
      },
    },
    contactInfo: {
      findFirst: async () => {
        const store = readStore();
        return store.contactInfo || { ...DEFAULT_CONTACT_INFO };
      },
      findUnique: async () => {
        const store = readStore();
        return store.contactInfo || { ...DEFAULT_CONTACT_INFO };
      },
      upsert: async ({ create, update }: { create?: any; update?: any }) => {
        const store = readStore();
        const merged = {
          ...(store.contactInfo || DEFAULT_CONTACT_INFO),
          ...(update || create || {}),
          id: "default",
          updatedAt: new Date().toISOString(),
        };
        store.contactInfo = merged;
        writeStore(store);
        return merged;
      },
      update: async ({ data }: { data: any }) => {
        const store = readStore();
        const merged = {
          ...(store.contactInfo || DEFAULT_CONTACT_INFO),
          ...data,
          id: "default",
          updatedAt: new Date().toISOString(),
        };
        store.contactInfo = merged;
        writeStore(store);
        return merged;
      },
    },
  };
}

let prisma: any;

if (isDatabaseConfigured) {
  if (process.env.NODE_ENV === "production") {
    prisma = new PrismaClient();
  } else {
    if (!global.cachedPrisma) {
      global.cachedPrisma = new PrismaClient();
    }
    prisma = global.cachedPrisma;
  }
} else {
  if (!global.cachedLocalDb || global.cachedLocalDb.__version !== 3) {
    global.cachedLocalDb = createLocalDb();
  }
  prisma = global.cachedLocalDb;
}

export const db = prisma;
