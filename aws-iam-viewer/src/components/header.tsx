'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Upload, Home, Database, FileText, Network, Shield } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

const navItems = [
  { href: '/', icon: Home, label: 'Home' },
  { href: '/uploads', icon: FileText, label: 'Uploads' },
  { href: '/dashboard', icon: Database, label: 'Dashboard' },
  { href: '/graph', icon: Network, label: 'Graph' },
] as const;

export function Header() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-500" />
              <span className="font-bold text-base tracking-tight">
                <span className="text-foreground">IAM</span>
                <span className="text-muted-foreground">_</span>
                <span className="text-amber-500">VIEWER</span>
              </span>
            </div>
            {/* Terminal cursor */}
            <span className="hidden sm:inline-block w-2 h-4 bg-amber-500 animate-pulse opacity-80" />
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            {navItems.map(({ href, icon: Icon, label }) => {
              const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
              return (
                <Link key={href} href={href}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`relative flex items-center gap-2 text-xs font-medium transition-all ${
                      isActive
                        ? 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/15'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                    {isActive && (
                      <span className="absolute bottom-1 left-2 right-2 h-[2px] bg-amber-500 rounded-full" />
                    )}
                  </Button>
                </Link>
              );
            })}

            {/* Separator */}
            <span className="w-px h-5 bg-border mx-1" />

            {/* Upload CTA */}
            {pathname !== '/' && (
              <Link href="/">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 text-xs font-medium border-amber-500/30 text-amber-500 hover:bg-amber-500/10 hover:border-amber-500/50 transition-all"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Upload</span>
                </Button>
              </Link>
            )}

            {/* Theme Toggle */}
            <ThemeToggle />
          </nav>
        </div>
      </div>
    </header>
  );
}
