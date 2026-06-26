import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ cookies, redirect }) => {
    cookies.delete("admin_session", { path: "/" });
    return redirect("/admin/login");
};

// Also support POST for better security practices
export const POST: APIRoute = async ({ cookies, redirect }) => {
    cookies.delete("admin_session", { path: "/" });
    return redirect("/admin/login");
};
