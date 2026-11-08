import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Link, Navigate, RouterProvider, createBrowserRouter } from "react-router";
import "./index.css";
import { LiveProvider } from "@/lib/api";
import { SiteLayout } from "@/components/site";
import { CourseLayout } from "@/components/course-layout";
import { CatalogPage } from "@/pages/catalog";
import { ProfilePage } from "@/pages/profile";
import { OverviewPage } from "@/pages/overview";
import { CodeExamplesPage, CourseIndex, IntroductionPage, SetupPage, StagePage } from "@/pages/course-pages";

function NotFound() {
  return (
    <main className="mx-auto max-w-[1024px] px-6 py-20">
      <h1 className="text-3xl font-bold text-ink">Page not found</h1>
      <Link to="/catalog" className="mt-4 inline-block font-semibold text-link underline">
        Back to the catalog
      </Link>
    </main>
  );
}

const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/catalog" replace /> },
  {
    element: <SiteLayout />,
    children: [
      { path: "/catalog", element: <CatalogPage /> },
      { path: "/profile", element: <ProfilePage /> },
      { path: "/courses/:slug/overview", element: <OverviewPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
  {
    path: "/courses/:slug",
    element: <CourseLayout />,
    children: [
      { index: true, element: <CourseIndex /> },
      { path: "introduction", element: <IntroductionPage /> },
      { path: "setup", element: <SetupPage /> },
      { path: "stages/:id", element: <StagePage /> },
      { path: "stages/:id/code-examples", element: <CodeExamplesPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LiveProvider>
      <RouterProvider router={router} />
    </LiveProvider>
  </StrictMode>,
);
