'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CopyFieldProps {
  value: string;
  displayValue?: string;
  className?: string;
  children?: React.ReactNode;
}

export function CopyField({ value, displayValue, className, children }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      // Check if clipboard API is available
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        // Fallback using document.execCommand (deprecated but works in some browsers)
        const textArea = document.createElement('textarea');
        textArea.value = value;
        
        // Make the textarea out of viewport
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } else {
          console.error('Fallback clipboard copy failed');
        }
      }
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 transition-colors group',
        className
      )}
      onClick={handleCopy}
      title={`Click to copy: ${value}`}
    >
      {children || <span className="break-all">{displayValue || value}</span>}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
        {copied ? (
          <Check className="h-3 w-3 text-green-600" />
        ) : (
          <Copy className="h-3 w-3 text-muted-foreground" />
        )}
      </div>
    </div>
  );
} 