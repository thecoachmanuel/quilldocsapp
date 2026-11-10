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

    // 3. Synchronize with Database User record
    let dbUser = await db.user.findFirst({
      where: { id: user.id },
    });

    // Check if any admin exists in the database at all (auto-bootstrap first owner)
    const existingAdmin = await db.user.findFirst({
      where: { role: "ADMIN" },
    });

    const shouldAutoPromote =
      hasKindeAdminClaim || isEnvAdmin || !existingAdmin;

    if (!dbUser) {
      const initialRole: UserRole = shouldAutoPromote ? "ADMIN" : "USER";
      dbUser = await db.user.create({
        data: {
          id: user.id,
          email,
          name: fullName,
          role: initialRole,
          status: "ACTIVE",
        },
      });
    } else {
      const updates: Record<string, any> = {};
      if (!dbUser.name && fullName) {
        updates.name = fullName;
      }
      if ((hasKindeAdminClaim || isEnvAdmin) && dbUser.role !== "ADMIN") {
        updates.role = "ADMIN";
      }
      if (!dbUser.role) {
        updates.role = shouldAutoPromote ? "ADMIN" : "USER";
      }
      if (!dbUser.status) {
        updates.status = "ACTIVE";
      }
      if (Object.keys(updates).length > 0) {
        dbUser = await db.user.update({
          where: { id: user.id },
          data: updates,
        });
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

