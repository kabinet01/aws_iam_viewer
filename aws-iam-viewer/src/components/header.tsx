'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Upload, Home, Database, FileText, Network, Shield, ShieldAlert, GitCompare } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

const navItems = [
  { href: '/', icon: Home, label: 'Home' },
  { href: '/uploads', icon: FileText, label: 'Uploads' },
  { href: '/dashboard', icon: Database, label: 'Dashboard' },
  { href: '/findings', icon: ShieldAlert, label: 'Findings' },
  { href: '/graph', icon: Network, label: 'Graph' },
  { href: '/diff', icon: GitCompare, label: 'Diff' },
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
              <Shield className="size-5 text-primary" />
              <span className="font-bold text-base tracking-tight">
                <span className="text-foreground">IAM</span>
                <span className="text-muted-foreground">_</span>
                <span className="text-primary">VIEWER</span>
              </span>
            </div>
            {/* Terminal cursor */}
            <span className="hidden sm:inline-block w-2 h-4 bg-primary animate-pulse opacity-80" />
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
                        ? 'text-primary bg-primary/10 hover:bg-primary/15'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                    }`}
                  >
                    <Icon className="size-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                    {isActive && (
                      <span className="absolute bottom-1 left-2 right-2 h-[2px] bg-primary rounded-full" />
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
                  className="flex items-center gap-2 text-xs font-medium border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50 transition-all"
                >
                  <Upload className="size-3.5" />
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
