import React from "react";
import { cn } from "@/lib/utils";
type AppLayoutProps = {
  children: React.ReactNode;
  container?: boolean;
  className?: string;
  contentClassName?: string;
};
/**
 * Root layout wrapper for MText.
 * Removed SidebarProvider and Sidebar dependencies for a cleaner production interface.
 */
export function AppLayout({ 
  children, 
  container = true, 
  className, 
  contentClassName 
}: AppLayoutProps): JSX.Element {
  return (
    <div className={cn("min-h-screen bg-background", className)}>
      <main>
        {container ? (
          <div className={cn(
            "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 lg:py-12",
            contentClassName
          )}>
            {children}
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}