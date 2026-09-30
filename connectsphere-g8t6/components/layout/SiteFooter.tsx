import Image from "next/image";

export function SiteFooter() {
  return (
    <footer className="bg-surface-container-low py-7 shadow-elevation-2">
      <div className="mx-auto flex max-w-page items-center gap-2 px-4 md:px-6">
        <Image src="/logo.png" alt="" width={24} height={24} className="size-6" />
        <p className="text-body-sm text-on-surface-variant">
          © {new Date().getFullYear()} ConnectSphere. Event planning and discovery.
        </p>
      </div>
    </footer>
  );
}
