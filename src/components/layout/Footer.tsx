import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-slate-200">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>&copy; {new Date().getFullYear()} WorkResolve. Built on GenLayer.</p>
        <div className="flex gap-4">
          <Link href="/#how-it-works" className="hover:text-slate-800">
            How it works
          </Link>
          <Link href="/#faq" className="hover:text-slate-800">
            FAQ
          </Link>
          <Link href="/demo" className="hover:text-slate-800">
            Demo
          </Link>
        </div>
      </div>
    </footer>
  );
}
