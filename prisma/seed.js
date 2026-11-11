const fs = require("fs");
const path = require("path");

// 1. Load .env file
function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

loadEnv();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Starting database seeding for QuillDocs on MongoDB Atlas...\n");

  // 1. Seed Plan Configurations
  console.log("📦 Seeding Plan Configurations...");
  const plans = [
    {
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
    },
    {
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
    },
  ];

  for (const p of plans) {
    const res = await prisma.planConfig.upsert({
      where: { slug: p.slug },
      update: p,
      create: p,
    });
    console.log(`   ✓ Plan '${res.name}' (${res.slug}): ₦${(res.priceNgn || 0).toLocaleString()} / $${res.price}`);
  }

  // 2. Seed Contact Info
  console.log("\n📞 Seeding Contact Information...");
  const contactInfo = await prisma.contactInfo.upsert({
    where: { id: "default" },
    update: {
      email: "support@quilldocs.com",
      phone: "+2347038587375",
      address: "Lagos, Nigeria",
      hours: "Monday - Friday: 9:00 AM - 6:00 PM (UTC+1)",
    },
    create: {
      id: "default",
      email: "support@quilldocs.com",
      phone: "+2347038587375",
      address: "Lagos, Nigeria",
      hours: "Monday - Friday: 9:00 AM - 6:00 PM (UTC+1)",
    },
  });
  console.log(`   ✓ Contact Details: ${contactInfo.email} | ${contactInfo.phone} | ${contactInfo.address}`);

  // 3. Read and migrate data from .quill_local_db.json if it exists
  const localDbPath = path.join(process.cwd(), ".quill_local_db.json");
  if (fs.existsSync(localDbPath)) {
    console.log("\n🔄 Migrating existing users, files & chat messages from local store...");
    const raw = fs.readFileSync(localDbPath, "utf-8");
    const localStore = JSON.parse(raw);

    // Users
    if (Array.isArray(localStore.users)) {
      let userCount = 0;
      for (const u of localStore.users) {
        if (!u.id || !u.email) continue;
        const email = u.email.toLowerCase().trim();

        const userData = {
          name: u.name || null,
          role: u.role || "USER",
          status: u.status || "ACTIVE",
          planPriceId: u.planPriceId || u.stripePriceId || null,
          currentPeriodEnd:
            u.currentPeriodEnd || u.stripeCurrentPeriodEnd
              ? new Date(u.currentPeriodEnd || u.stripeCurrentPeriodEnd)
              : null,
        };

        const cid = u.customerId || u.stripeCustomerId;
        if (cid && cid.trim() !== "") {
          userData.customerId = cid.trim();
        }
        const sid = u.subscriptionId || u.stripeSubscriptionId;
        if (sid && sid.trim() !== "") {
          userData.subscriptionId = sid.trim();
        }

        const existingUser = await prisma.user.findFirst({
          where: { OR: [{ id: u.id }, { email }] },
        });

        if (existingUser) {
          await prisma.user.update({
            where: { id: existingUser.id },
            data: userData,
          });
        } else {
          await prisma.user.create({
            data: {
              id: u.id,
              email,
              ...userData,
            },
          });
        }
        userCount++;
      }
      console.log(`   ✓ Seeded ${userCount} users (including Administrators)`);
    }

    // Files
    if (Array.isArray(localStore.files)) {
      let fileCount = 0;
      for (const f of localStore.files) {
        if (!f.id || !f.key) continue;
        const exists = await prisma.file.findFirst({ where: { id: f.id } });
        if (!exists) {
          await prisma.file.create({
            data: {
              id: f.id,
              name: f.name || "Untitled Document",
              uploadStatus: f.uploadStatus || "SUCCESS",
              url: f.url || "",
              key: f.key,
              userId: f.userId || null,
            },
          });
          fileCount++;
        }
      }
      console.log(`   ✓ Seeded ${fileCount} documents`);
    }

    // Messages
    if (Array.isArray(localStore.messages)) {
      let msgCount = 0;
      for (const m of localStore.messages) {
        if (!m.id || !m.text) continue;
        const exists = await prisma.message.findFirst({ where: { id: m.id } });
        if (!exists) {
          await prisma.message.create({
            data: {
              id: m.id,
              text: m.text,
              isUserMessage: Boolean(m.isUserMessage),
              userId: m.userId || null,
              fileId: m.fileId || null,
            },
          });
          msgCount++;
        }
      }
      console.log(`   ✓ Seeded ${msgCount} chat messages`);
    }

    // Contact Messages
    if (Array.isArray(localStore.contactMessages)) {
      let contactMsgCount = 0;
      for (const cm of localStore.contactMessages) {
        if (!cm.id || !cm.email) continue;
        const exists = await prisma.contactMessage.findFirst({ where: { id: cm.id } });
        if (!exists) {
          await prisma.contactMessage.create({
            data: {
              id: cm.id,
              name: cm.name || "Visitor",
              email: cm.email,
              subject: cm.subject || null,
              message: cm.message || "",
              status: cm.status || "UNREAD",
            },
          });
          contactMsgCount++;
        }
      }
      console.log(`   ✓ Seeded ${contactMsgCount} contact inquiries`);
    }
  }

  // Ensure Admin accounts are always set to ADMIN role
  const adminEmails = [
    "manueloliver2908@gmail.com",
    "olaitanadewale2016@gmail.com",
  ];
  for (const email of adminEmails) {
    const user = await prisma.user.findFirst({ where: { email } });
    if (user && user.role !== "ADMIN") {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: "ADMIN" },
      });
      console.log(`   👑 Promoted ${email} to ADMIN role`);
    }
  }

  console.log("\n🎉 Database seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
