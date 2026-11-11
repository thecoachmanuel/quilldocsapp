import { getKindeServerSession } from "@/lib/kinde";
import { db } from "@/db";

export type UserRole = "ADMIN" | "USER";
export type UserStatus = "ACTIVE" | "SUSPENDED";

export interface SessionWithRBAC {
  isAuthenticated: boolean;
  isAdmin: boolean;
  role: UserRole;
  status: UserStatus;
  user: {
    id: string;
    email: string;
    name: string;
    picture?: string | null;
  } | null;
  kindeRoles: string[];
  kindePermissions: string[];
}

/**
 * Ensures a database User record exists matching the authenticated Kinde user.
 * Gracefully handles Kinde ID reassignments, email changes, and auto-links existing records
 * to prevent duplicate key / unique constraint violations in MongoDB.
 */
export async function ensureDbUser(kindeUser: {
  id: string;
  email?: string | null;
  given_name?: string | null;
  family_name?: string | null;
}) {
  if (!kindeUser || !kindeUser.id) return null;

  const email = (kindeUser.email || `${kindeUser.id}@kinde.user`)
    .toLowerCase()
    .trim();
  const fullName =
    [kindeUser.given_name, kindeUser.family_name]
      .filter(Boolean)
      .join(" ")
      .trim() || email.split("@")[0];

  try {
    // 1. Direct match by Kinde user ID
    let dbUser = await db.user.findFirst({
      where: { id: kindeUser.id },
    });

    if (dbUser) {
      return dbUser;
    }

    // 2. Lookup by email (handles new Kinde project / ID changes gracefully)
    const existingByEmail = await db.user.findFirst({
      where: { email },
    });

    if (existingByEmail) {
      // Re-link previous records (files, messages) to new Kinde ID
      try {
        await db.file.updateMany({
          where: { userId: existingByEmail.id },
          data: { userId: kindeUser.id },
        });
        await db.message.updateMany({
          where: { userId: existingByEmail.id },
          data: { userId: kindeUser.id },
        });
        await db.user.delete({
          where: { id: existingByEmail.id },
        });
      } catch (migrationErr) {
        console.warn("[ensureDbUser] Record relinking notice:", migrationErr);
      }

      return await db.user.create({
        data: {
          id: kindeUser.id,
          email,
          name: existingByEmail.name || fullName,
          role: existingByEmail.role || "USER",
          status: existingByEmail.status || "ACTIVE",
          customerId: existingByEmail.customerId || null,
          subscriptionId: existingByEmail.subscriptionId || null,
          planPriceId: existingByEmail.planPriceId || null,
          currentPeriodEnd: existingByEmail.currentPeriodEnd || null,
        },
      });
    }

    // 3. Brand new user
    const adminEmails = (
      process.env.ADMIN_EMAILS ||
      "manueloliver2908@gmail.com,olaitanadewale2016@gmail.com"
    )
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const isWhiteListedAdmin = adminEmails.includes(email);
    const anyAdminExists = await db.user.findFirst({
      where: { role: "ADMIN" },
    });
    const initialRole: UserRole =
      isWhiteListedAdmin || !anyAdminExists ? "ADMIN" : "USER";

    return await db.user.create({
      data: {
        id: kindeUser.id,
        email,
        name: fullName,
        role: initialRole,
        status: "ACTIVE",
      },
    });
  } catch (err: any) {
    console.error("[ensureDbUser] Error ensuring DB user:", err);
    return await db.user.findFirst({
      where: { OR: [{ id: kindeUser.id }, { email }] },
    });
  }
}

/**
 * Resolves the current user's Kinde session, Kinde roles/permissions,
 * and synchronizes role-based access control (RBAC) with the database.
 */
export async function getUserSessionWithRBAC(): Promise<SessionWithRBAC> {
  try {
    const session = getKindeServerSession();
    const user = await session.getUser();

    if (!user || !user.id) {
      return {
        isAuthenticated: false,
        isAdmin: false,
        role: "USER",
        status: "ACTIVE",
        user: null,
        kindeRoles: [],
        kindePermissions: [],
      };
    }

    // 1. Extract Kinde RBAC claims (Roles & Permissions configured in Kinde Dashboard)
    let kindeRoles: string[] = [];
    let kindePermissions: string[] = [];

    try {
      const anySession = session as any;
      if (typeof anySession.getRoles === "function") {
        const rawRoles = await anySession.getRoles();
        if (Array.isArray(rawRoles)) {
          kindeRoles = rawRoles
            .map((r: any) => (r?.key || r?.name || "").toLowerCase())
            .filter(Boolean);
        }
      } else if (typeof anySession.getClaim === "function") {
        const rolesClaim = await anySession.getClaim("roles");
        const val = rolesClaim?.value;
        if (Array.isArray(val)) {
          kindeRoles = val
            .map((r: any) =>
              (typeof r === "string" ? r : r?.key || r?.name || "").toLowerCase()
            )
            .filter(Boolean);
        }
      }
      if (typeof session.getPermissions === "function") {
        const rawPerms = await session.getPermissions();
        if (rawPerms && Array.isArray(rawPerms.permissions)) {
          kindePermissions = rawPerms.permissions.map((p: string) =>
            p.toLowerCase()
          );
        }
      }
    } catch {
      // Kinde roles/permissions claim optional if not yet set in Kinde token
    }

    const email = (user.email || `${user.id}@kinde.user`).toLowerCase();
    const fullName =
      [user.given_name, user.family_name].filter(Boolean).join(" ") ||
      email.split("@")[0];

    // 2. Check environment variable ADMIN_EMAILS whitelist
    const adminEmailsEnv = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const hasKindeAdminClaim =
      kindeRoles.some(
        (r) => r === "admin" || r === "super_admin" || r === "owner"
      ) ||
      kindePermissions.some(
        (p) =>
          p === "admin:access" ||
          p === "manage:users" ||
          p === "manage:plans" ||
          p === "manage:subscriptions"
      );

    const isEnvAdmin = adminEmailsEnv.includes(email);

    // 3. Synchronize with Database User record via safe ensureDbUser
    let dbUser = await ensureDbUser(user);

    if (dbUser) {
      const updates: Record<string, any> = {};
      if (!dbUser.name && fullName) {
        updates.name = fullName;
      }
      if ((hasKindeAdminClaim || isEnvAdmin) && dbUser.role !== "ADMIN") {
        updates.role = "ADMIN";
      }
      if (Object.keys(updates).length > 0) {
        try {
          dbUser = await db.user.update({
            where: { id: dbUser.id },
            data: updates,
          });
        } catch (updateErr) {
          console.warn("[auth-rbac] Notice updating user attributes:", updateErr);
        }
      }
    }

    const effectiveRole: UserRole =
      dbUser?.role === "ADMIN" || hasKindeAdminClaim || isEnvAdmin
        ? "ADMIN"
        : "USER";

    const effectiveStatus: UserStatus =
      dbUser?.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";

    return {
      isAuthenticated: true,
      isAdmin: effectiveRole === "ADMIN",
      role: effectiveRole,
      status: effectiveStatus,
      user: {
        id: user.id,
        email: dbUser?.email || email,
        name: dbUser?.name || fullName,
        picture: user.picture,
      },
      kindeRoles,
      kindePermissions,
    };
  } catch (error) {
    console.error("[auth-rbac] Error resolving RBAC session:", error);
    return {
      isAuthenticated: false,
      isAdmin: false,
      role: "USER",
      status: "ACTIVE",
      user: null,
      kindeRoles: [],
      kindePermissions: [],
    };
  }
}

