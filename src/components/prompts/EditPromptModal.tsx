
import { useState, useEffect } from "react";
import { X, Upload, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AI_TOOLS, FEATURED_AI_TOOL } from "@/lib/aiTools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STANDARD_TAGS } from "@/lib/standardTags";
import { getErrorMessage } from "@/lib/errors";

interface EditPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: {
    id: string;
    title: string;
    prompt_text: string;
    image_url: string;
    tool_used: string;
    tags: string[];
  };
  onUpdated: () => void;
}


export function EditPromptModal({
  isOpen,
  onClose,
  prompt,
  onUpdated,
}: EditPromptModalProps) {
  const [title, setTitle] = useState(prompt.title);
  const [promptText, setPromptText] = useState(prompt.prompt_text);
  const [toolUsed, setToolUsed] = useState(prompt.tool_used);
  const [customTool, setCustomTool] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>(prompt.tags);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState(prompt.image_url);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Determine if current tool is a custom "Other" tool
  useEffect(() => {
    if (!AI_TOOLS.includes(prompt.tool_used)) {
      setToolUsed("Other");
      setCustomTool(prompt.tool_used);
    } else {
      setToolUsed(prompt.tool_used);
      setCustomTool("");
    }
  }, [prompt.tool_used]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else if (selectedTags.length < 8) {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const getActualToolName = () => {
    return toolUsed === "Other" ? customTool : toolUsed;
  };

  const handleSubmit = async () => {
    if (!title.trim() || !promptText.trim() || selectedTags.length < 3) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields and select at least 3 tags",
        variant: "destructive",
      });
      return;
    }

    const actualTool = getActualToolName();
    if (!actualTool.trim()) {
      toast({
        title: "Tool required",
        description: "Please specify the tool used",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { supabase } = await import('@/services/supabase/client');
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("User not authenticated");
      }

      let finalImageUrl = prompt.image_url;

      // A changed image has to reach storage before the row is written.
      // `imagePreview` is an object URL that only resolves inside this tab, so
      // saving it would leave an image that is broken for everyone, forever,
      // with no file anywhere to recover it from.
      if (imageFile) {
        const { uploadPromptImage } = await import('@/services/supabase/storage');
        const { url, error: uploadError } = await uploadPromptImage(user.id, imageFile);

        if (uploadError || !url) {
          toast({
            title: "Image upload failed",
            description: uploadError || "Could not upload image to storage",
            variant: "destructive",
          });
          return;
        }

        finalImageUrl = url;
      }

      // Update prompt in Supabase
      const { updatePrompt } = await import('@/services/supabase/prompts');

      const { prompt: updated, error } = await updatePrompt(prompt.id, user.id, {
        title: title.trim(),
        prompt: promptText.trim(),
        ai_tool: actualTool.trim(),
        image_url: finalImageUrl,
        tags: selectedTags
      });

      if (error || !updated) {
        throw new Error(error || "Failed to update prompt");
      }

      // The row now points at the replacement. Cleanup must not turn a
      // successful edit into an error or remove an image still in use.
      if (imageFile && prompt.image_url && finalImageUrl !== prompt.image_url) {
        try {
          const { deletePromptImage } = await import('@/services/supabase/storage');
          const { error: cleanupError } = await deletePromptImage(prompt.image_url);
          if (cleanupError) {
            console.error('Prompt updated but image cleanup failed:', cleanupError);
          }
        } catch (cleanupError) {
          console.error('Prompt updated but image cleanup failed:', cleanupError);
        }
      }

      toast({ title: "Prompt updated successfully" });
      onUpdated();
      onClose();
    } catch (error) {
      toast({
        title: "Update failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Edit Prompt</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Image */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Image</Label>
            <div className="relative">
              <img
                src={imagePreview}
                alt="Preview"
                className="w-full max-h-64 object-contain rounded-sm bg-secondary"
              />
              <label className="absolute bottom-3 right-3 p-2 rounded-full bg-background/90 backdrop-blur-sm cursor-pointer hover:bg-background transition-colors">
                <Upload className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Title */}
          <div>
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter title"
              className="mt-1"
            />
          </div>

          {/* Prompt Text */}
          <div>
            <Label htmlFor="edit-prompt">Prompt Text</Label>
            <Textarea
              id="edit-prompt"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Enter your prompt"
              rows={4}
              className="mt-1"
            />
          </div>

          {/* Tool Used */}
          <div>
            <Label>Tool Used</Label>
            <Select value={toolUsed} onValueChange={setToolUsed}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select tool" />
              </SelectTrigger>
              <SelectContent>
                {AI_TOOLS.map((tool) => (
                  <SelectItem key={tool} value={tool}>
                    {tool === FEATURED_AI_TOOL ? (
                      <div className="flex items-center gap-2">
                        <span className="bg-gradient-to-r from-accent to-accent/70 bg-clip-text text-transparent font-medium">
                          {tool}
                        </span>
                        <TrendingUp className="h-3 w-3 text-gold" />
                      </div>
                    ) : (
                      tool
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {toolUsed === "Other" && (
              <Input
                value={customTool}
                onChange={(e) => setCustomTool(e.target.value)}
                placeholder="Enter tool name"
                className="mt-2"
              />
            )}
          </div>

          {/* Tags */}
          <div>
            <Label>
              Tags ({selectedTags.length}/8) - minimum 3
            </Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {STANDARD_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 text-sm rounded-sm border transition-colors ${selectedTags.includes(tag)
                      ? "bg-gold text-gold-foreground border-gold"
                      : "bg-secondary border-border hover:border-gold/50"
                    }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || selectedTags.length < 3 || (toolUsed === "Other" && !customTool.trim())}
              className="flex-1"
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
