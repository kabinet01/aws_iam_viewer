'use client';

import { useState, useRef, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, Terminal, Shield, ArrowRight, FileJson } from 'lucide-react';
import { processAuthDetails } from '@/lib/iam-utils';
import { RawIAMData } from '@/lib/types';
import { indexedDBService } from '@/lib/indexeddb';
import { toast } from 'sonner';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const selectFile = (selectedFile: File) => {
    if (selectedFile.name.endsWith('.json')) {
      setFile(selectedFile);
      setError('');
    } else {
      setError('Please upload a JSON file');
      setFile(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) selectFile(selectedFile);
  };

  const handleDragEnter = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); };
  const handleDragLeave = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); };
  const handleDragOver = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) selectFile(droppedFile);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError('Please select a file'); return; }
    setIsLoading(true);
    setError('');
    try {
      const text = await file.text();
      const data: RawIAMData = JSON.parse(text);
      const processedData = processAuthDetails(data);
      const uploadId = generateUUID();
      const uploadData = {
        id: uploadId,
        name: name || file.name,
        originalFilename: file.name,
        uploadedAt: new Date().toISOString(),
        size: file.size,
        data: processedData,
      };
      await indexedDBService.saveUpload(uploadData);
      await indexedDBService.setCurrentUploadId(uploadId);
      toast.success('Upload complete! Navigating to dashboard...');
      router.push('/dashboard');
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        setError(`JSON parsing error: ${error.message}`);
      } else if (error instanceof Error) {
        setError(`Processing error: ${error.message}`);
      } else {
        setError('Error processing file. Please ensure it\'s a valid account-authorization-details.json file.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-16 py-12">
      {/* Hero — Brutalist typography with terminal angle */}
      <div className="space-y-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-[0.2em]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>AWS Security Analysis Tool</span>
          </div>
          <h1 className="text-5xl font-bold leading-[1.05] tracking-tight">
            <span className="text-foreground">Audit your</span>
            <br />
            <span className="text-amber-500">IAM permissions</span>
            <span className="text-muted-foreground">.</span>
          </h1>
          <p className="text-base text-muted-foreground max-w-lg leading-relaxed">
            Upload an <code className="font-mono text-xs bg-secondary px-1.5 py-0.5 text-amber-500/80">
              account-authorization-details.json
            </code> file. Everything runs locally in your browser — no data leaves your machine.
          </p>
        </div>

        {/* Stats row — decorative */}
        <div className="flex gap-6 text-xs font-mono text-muted-foreground/60">
          <div className="flex items-center gap-2">
            <span className="text-amber-500/60">01</span>
            <span>Upload JSON</span>
          </div>
          <span className="text-muted-foreground/30">→</span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground/40">02</span>
            <span>Analyze Locally</span>
          </div>
          <span className="text-muted-foreground/30">→</span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground/40">03</span>
            <span>Audit & Fix</span>
          </div>
        </div>
      </div>

      {/* Upload Card — Sharp edges, border accent */}
      <div className="border border-border bg-card">
        {/* Card header accent bar */}
        <div className="h-1 bg-gradient-to-r from-amber-500 via-amber-500/50 to-transparent" />

        <div className="p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 bg-amber-500/10">
              <FileJson className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <h2 className="font-bold text-sm uppercase tracking-wider">Upload IAM Data</h2>
              <p className="text-xs text-muted-foreground">account-authorization-details.json</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <Alert variant="destructive" className="border-l-2 border-l-destructive">
                <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Upload Name <span className="text-muted-foreground/40">(optional)</span>
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="e.g., Production Account"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="font-mono text-sm bg-secondary/50 border-border focus:border-amber-500/50 transition-colors"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="file" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                JSON File
              </Label>
              <div
                className={`border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-150 ${
                  isDragOver
                    ? 'border-amber-500 bg-amber-500/5 scale-[1.01]'
                    : file
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-border hover:border-amber-500/30 hover:bg-secondary/30'
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <div className={`mb-3 transition-transform duration-150 ${isDragOver ? 'scale-110' : ''}`}>
                  {file ? (
                    <FileJson className="h-10 w-10 mx-auto text-emerald-500" />
                  ) : (
                    <Upload className={`h-10 w-10 mx-auto ${isDragOver ? 'text-amber-500' : 'text-muted-foreground/40'}`} />
                  )}
                </div>
                {file ? (
                  <div className="space-y-1">
                    <p className="text-sm font-mono font-medium text-foreground">{file.name}</p>
                    <p className="text-xs font-mono text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB — Click or drop to change
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {isDragOver ? 'Drop your file here' : 'Drag & drop your JSON file here'}
                    </p>
                    <p className="text-xs font-mono text-muted-foreground">
                      or click to browse
                    </p>
                  </div>
                )}
                <Input
                  ref={fileInputRef}
                  id="file"
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  required
                  className="hidden"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading || !file}
              className="w-full h-11 font-bold text-sm uppercase tracking-wider bg-amber-500 hover:bg-amber-400 text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-black/30 border-t-black rounded-full" />
                  Processing...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Upload and Analyze
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </form>
        </div>
      </div>

      {/* Instructions — Minimal, mono */}
      <div className="border border-border bg-card/50">
        <div className="p-8 space-y-4">
          <div className="flex items-center gap-3">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-bold text-sm uppercase tracking-wider">CLI Instructions</h3>
          </div>
          <div className="font-mono text-xs text-muted-foreground space-y-2">
            <p className="flex items-center gap-2">
              <span className="text-amber-500/60">$</span>
              <span>aws iam get-account-authorization-details</span>
              <span className="text-muted-foreground/50">--output json</span>
              <span className="text-muted-foreground/50">&gt;</span>
              <span className="text-emerald-500/60">account-authorization-details.json</span>
            </p>
          </div>

          <Alert className="border-l-2 border-l-amber-500/50 bg-amber-500/5">
            <Shield className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-xs">
              <span className="text-amber-500 font-bold">LOCAL ONLY:</span> All processing happens in your browser.
              No data is sent to external servers. Your AWS credentials and IAM data remain on your machine.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </div>
  );
}
