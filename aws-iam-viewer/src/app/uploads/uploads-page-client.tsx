'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Breadcrumb } from '@/components/breadcrumb';
import { FileText, Upload, Trash2, Database } from 'lucide-react';
import { formatDateTime, formatFileSize } from '@/lib/iam-utils';
import { useUploads } from '@/hooks/use-uploads';
import { toast } from 'sonner';



export default function UploadsPage() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { uploads, currentUploadId, isLoading, error, setCurrentUpload, deleteUpload, reload } = useUploads();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const router = useRouter();

  const handleSwitchUpload = async (uploadId: string) => {
    setErrorMessage(null);
    try {
      await setCurrentUpload(uploadId);
      const name = uploads?.[uploadId]?.name || uploadId;
      toast.success(`Switched to: ${name}`);
      router.push('/dashboard');
    } catch (error) {
      console.error('Failed to switch upload:', error);
      setErrorMessage('Failed to switch upload');
      toast.error('Failed to switch upload');
    }
  };

  const handleDeleteUpload = async (uploadId: string) => {
    setErrorMessage(null);
    try {
      const name = uploads?.[uploadId]?.name || uploadId;
      await deleteUpload(uploadId);
      toast.success(`Deleted: ${name}`);
    } catch (error) {
      console.error('Failed to delete upload:', error);
      setErrorMessage('Failed to delete upload');
      toast.error('Failed to delete upload');
    }
  };

  const onRetry = async () => {
    setErrorMessage(null);
    await reload();
  };

  const shownError = errorMessage ?? error;

  if (shownError) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <Breadcrumb />
        <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground bg-muted/30">
          {shownError}
          <div className="mt-4">
            <Button variant="outline" onClick={onRetry}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const sortedUploads = Object.entries(uploads ?? {}).sort(([, a], [, b]) =>
    new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <Breadcrumb />
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-9 w-36" />
        </div>
        <Card>
          <CardContent className="py-8">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full mb-2" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (sortedUploads.length === 0) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <Breadcrumb />
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Uploaded Files</h1>
          <Button onClick={() => router.push('/')}>
            <Upload className="size-4 mr-2" />
            Upload New File
          </Button>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="size-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No uploaded files</h3>
            <p className="text-muted-foreground text-center mb-4">
              You haven&apos;t uploaded any IAM authorization details files yet.
            </p>
            <Button onClick={() => router.push('/')}>
              <Upload className="size-4 mr-2" />
              Upload Your First File
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Breadcrumb />
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Uploaded Files</h1>
        <Button onClick={() => router.push('/')}>
          <Upload className="size-4 mr-2" />
          Upload New File
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            <span>Your Uploads</span>
          </CardTitle>
          <CardDescription>
            Manage your uploaded IAM authorization details files
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Original Filename</TableHead>
                <TableHead>Upload Date</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedUploads.map(([uploadId, upload]) => (
                <TableRow key={uploadId}>
                  <TableCell className="font-medium">{upload.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {upload.originalFilename}
                  </TableCell>
                  <TableCell>{formatDateTime(upload.uploadedAt)}</TableCell>
                  <TableCell>{formatFileSize(upload.size)}</TableCell>
                  <TableCell>
                    {currentUploadId === uploadId ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {currentUploadId !== uploadId && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSwitchUpload(uploadId)}
                        >
                          <Database className="size-4 mr-1" />
                          Switch
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteConfirmId(uploadId)}
                      >
                        <Trash2 className="size-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {currentUploadId && (
        <Alert>
          <Database className="size-4" />
          <AlertDescription>
            <strong>Current active upload:</strong> {uploads?.[currentUploadId]?.name}
            <Button
              variant="link"
              className="p-0 h-auto ml-2"
              onClick={() => router.push('/dashboard')}
            >
              View Dashboard
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Upload</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{uploads?.[deleteConfirmId || '']?.name || 'this upload'}</strong>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirmId) {
                  handleDeleteUpload(deleteConfirmId);
                  setDeleteConfirmId(null);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
