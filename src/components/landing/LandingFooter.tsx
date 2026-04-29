export function LandingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-gray-100 bg-white py-10">
      <div className="mx-auto max-w-5xl px-6">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <span className="text-lg font-extrabold text-gray-900">
            iCareer<span className="text-blue-600">OS</span>
          </span>
          <p className="text-sm text-gray-400">
            © {year} Jabri Solutions. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-gray-400">
            <a href="/auth/login" className="transition hover:text-gray-700">
              Sign In
            </a>
            <a href="/auth/signup" className="transition hover:text-gray-700">
              Sign Up
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
