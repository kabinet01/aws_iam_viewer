'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Upload, Home, Database, FileText } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

export function Header() {
  const pathname = usePathname();

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold">AWS IAM Authorization Details Viewer</h1>
          </div>
          
          <nav className="flex items-center space-x-2">
            <Link href="/">
              <Button 
                variant={pathname === '/' ? 'default' : 'ghost'} 
                size="sm"
                className="flex items-center space-x-2"
              >
                <Home className="h-4 w-4" />
                <span>Home</span>
              </Button>
            </Link>
            
            <Link href="/uploads">
              <Button 
                variant={pathname === '/uploads' ? 'default' : 'ghost'} 
                size="sm"
                className="flex items-center space-x-2"
              >
                <FileText className="h-4 w-4" />
                <span>Uploaded Files</span>
              </Button>
            </Link>
            
            <Link href="/dashboard">
              <Button 
                variant={pathname === '/dashboard' ? 'default' : 'ghost'} 
                size="sm"
                className="flex items-center space-x-2"
              >
                <Database className="h-4 w-4" />
                <span>Dashboard</span>
              </Button>
            </Link>
            
            {pathname !== '/' && (
              <Link href="/">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex items-center space-x-2"
                >
                  <Upload className="h-4 w-4" />
                  <span>Upload New File</span>
                </Button>
              </Link>
            )}
            
            <ThemeToggle />
          </nav>
        </div>
      </div>
    </header>
  );
} 