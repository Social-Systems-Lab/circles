"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from 'next/navigation';
import { Circle } from '@/models/models';
import { generateHandle } from '@/lib/utils/helpers-client';
import { Label } from '@/components/ui/label';
import { createCircle, updateCircle } from '@/lib/data/circle';
import { useToast } from '@/components/ui/use-toast';
import { Plus } from 'lucide-react';
import { isFile, saveFile } from '@/lib/data/storage';

interface CreateProjectDialogProps {
  parentCircle: Circle;
}

export function CreateProjectDialog({ parentCircle }: CreateProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate inputs
    if (!title.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide a title for your project",
        variant: "destructive"
      });
      return;
    }
    
    // Validate file type if provided
    if (coverImage) {
      const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!validImageTypes.includes(coverImage.type)) {
        toast({
          title: "Invalid File",
          description: "Please upload a valid image file (JPEG, PNG, GIF, WEBP)",
          variant: "destructive"
        });
        return;
      }
      
      // Check file size (5MB max)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (coverImage.size > maxSize) {
        toast({
          title: "File Too Large",
          description: "Image size should be less than 5MB",
          variant: "destructive"
        });
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Generate a handle from the title
      const handle = generateHandle(title);

      // Create a new project
      const newProject: Partial<Circle> = {
        name: title,
        handle: handle,
        content: content,
        isPublic: true,
        parentCircleId: parentCircle._id,
        circleType: "project"
      };

      // Submit the project
      const response = await createCircle(newProject as Circle);
      
      // Upload cover image if provided
      if (coverImage && response._id) {
        try {
          const coverInfo = await saveFile(coverImage, "cover", response._id, true);
          
          // Update the project with the cover image
          await updateCircle({
            _id: response._id,
            cover: coverInfo
          });
        } catch (error) {
          console.error("Error uploading cover image:", error);
          // Continue anyway since the project was created successfully
        }
      }

      setOpen(false);
      toast({
        title: "Success",
        description: "Project created successfully",
      });
      
      // Refresh the page to show the new project
      router.refresh();
    } catch (error) {
      console.error("Error creating project:", error);
      toast({
        title: "Failed to create project",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Project title"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="content">Description</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Detailed project description"
              rows={5}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="cover">Cover Image</Label>
            <Input
              id="cover"
              type="file"
              accept="image/*"
              onChange={(e) => setCoverImage(e.target.files ? e.target.files[0] : null)}
            />
          </div>
          
          <div className="flex justify-end space-x-2 pt-4">
            <Button 
              variant="outline" 
              onClick={() => setOpen(false)}
              type="button"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create Project'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}