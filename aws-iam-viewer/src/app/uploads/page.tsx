'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileText, Upload, Trash2, Database } from 'lucide-react';
import { formatDateTime, formatFileSize } from '@/lib/iam-utils';
import { ProcessedIAMData } from '@/lib/types';

interface UploadData {
  id: string;
  name: string;
  originalFilename: string;
  uploadedAt: string;
  size: number;
  data: ProcessedIAMData;
}

export default function UploadsPage() {
  const [uploads, setUploads] = useState<Record<string, UploadData>>({});
  const [currentUploadId, setCurrentUploadId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Load uploads from localStorage
    const storedUploads = JSON.parse(localStorage.getItem('iam-uploads') || '{}');
    const currentId = localStorage.getItem('iam-current-upload');
    
    setUploads(storedUploads);
    setCurrentUploadId(currentId);
  }, []);

  const handleSwitchUpload = (uploadId: string) => {
    localStorage.setItem('iam-current-upload', uploadId);
    setCurrentUploadId(uploadId);
    router.push('/dashboard');
  };

  const handleDeleteUpload = (uploadId: string) => {
    const updatedUploads = { ...uploads };
    delete updatedUploads[uploadId];
    
    localStorage.setItem('iam-uploads', JSON.stringify(updatedUploads));
    setUploads(updatedUploads);
    
    // If we deleted the current upload, clear it
    if (currentUploadId === uploadId) {
      localStorage.removeItem('iam-current-upload');
      setCurrentUploadId(null);
    }
  };

  const sortedUploads = Object.entries(uploads).sort(([, a], [, b]) => 
    new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );

  if (sortedUploads.length === 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Uploaded Files</h1>
          <Button onClick={() => router.push('/')}>
            <Upload className="h-4 w-4 mr-2" />
            Upload New File
          </Button>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No uploaded files</h3>
            <p className="text-muted-foreground text-center mb-4">
              You haven&apos;t uploaded any IAM authorization details files yet.
            </p>
            <Button onClick={() => router.push('/')}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Your First File
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Uploaded Files</h1>
        <Button onClick={() => router.push('/')}>
          <Upload className="h-4 w-4 mr-2" />
          Upload New File
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
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
                    <div className="flex items-center space-x-2">
                      {currentUploadId !== uploadId && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSwitchUpload(uploadId)}
                        >
                          <Database className="h-4 w-4 mr-1" />
                          Switch
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteUpload(uploadId)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
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
          <Database className="h-4 w-4" />
          <AlertDescription>
            <strong>Current active upload:</strong> {uploads[currentUploadId]?.name}
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
    </div>
  );
} 