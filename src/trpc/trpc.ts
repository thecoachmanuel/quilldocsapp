import { getKindeServerSession } from "@/lib/kinde";
import { getUserSessionWithRBAC, ensureDbUser } from "@/lib/auth-rbac";
import { TRPCError, initTRPC } from "@trpc/server";

const t = initTRPC.create();
const middleware = t.middleware;

const isAuth = middleware(async (opts) => {
  const { getUser } = getKindeServerSession();
  const user = await getUser();

  if (!user || !user.id) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  await ensureDbUser(user);

  return opts.next({
    ctx: {
      userId: user.id,
      user,
    },
  });
});

const isAdmin = middleware(async (opts) => {
  const rbac = await getUserSessionWithRBAC();

  if (!rbac.isAuthenticated || !rbac.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  if (!rbac.isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access denied. Administrator role is required.",
    });
  }

  return opts.next({
    ctx: {
      userId: rbac.user.id,
      user: rbac.user,
      role: rbac.role,
      isAdmin: true,
    },
  });
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const privateProcedure = t.procedure.use(isAuth);
export const adminProcedure = t.procedure.use(isAdmin);
