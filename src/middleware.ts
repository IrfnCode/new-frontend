import { runMigrations } from './lib/db-migrate';

// Jalankan auto-migration sekali saat server start
runMigrations().catch(e => console.error('[Middleware] Migration failed:', e.message));

export async function onRequest(context: any, next: any) {
    const { url, cookies, redirect } = context;

    // Protect all /admin routes except /admin/login
    if (url.pathname.startsWith("/admin") && url.pathname !== "/admin/login") {
        const session = cookies.get("admin_session");

        if (!session || session.value !== "active") {
            return redirect("/admin/login");
        }
    }

    // Also prevent logged-in users from seeing the login page
    if (url.pathname === "/admin/login") {
        const session = cookies.get("admin_session");
        if (session && session.value === "active") {
            return redirect("/admin");
        }
    }

    return next();
}
