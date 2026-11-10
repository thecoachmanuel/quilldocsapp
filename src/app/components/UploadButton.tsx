"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { useUploadThing } from "@/lib/uploadthing";
import { DialogTrigger } from "@radix-ui/react-dialog";
import {
  Cloud,
  File,
  Loader2,
  FileText,
  Presentation,
  Gem,
  ArrowRight,
} from "lucide-react";
import { useState } from "react";
import DropZone from "react-dropzone";
import { trpc } from "../_trpc/client";
import { useRouter } from "next/navigation";

const UploadDropZone = ({
  isSubscribed,
  closeDialog,
}: {
  isSubscribed: boolean;
  closeDialog?: () => void;
}) => {
  const router = useRouter();
  const utils = trpc.useContext();

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const { toast } = useToast();
  const { startUpload } = useUploadThing(
    isSubscribed ? "proPlanUploader" : "freePlanUploader"
  );

  const { mutate: startPolling } = trpc.getFile.useMutation({
    onSuccess: (file) => {
      utils.getUserFiles.invalidate();
      router.refresh();
      if (closeDialog) closeDialog();
      router.push(`/dashboard/${file.id}`);
    },

    retry: true,
    retryDelay: 500,
  });

  const startSimulatedProgress = () => {
    setUploadProgress(0);

    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 95) {
          clearInterval(interval);
          return prev;
        }
        return prev + 5;
      });
    }, 500);

    return interval;
  };

  return (
    <DropZone
      noClick={true}
      multiple={false}
      accept={{
        "application/pdf": [".pdf"],
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
          ".docx",
        ],
        "application/msword": [".doc"],
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
          ".pptx",
        ],
        "application/vnd.ms-powerpoint": [".ppt"],
      }}
      onDrop={async (acceptedFile) => {
        if (!acceptedFile || !acceptedFile[0]) return;

        // Client-side file size check
        const maxBytes = isSubscribed ? 16 * 1024 * 1024 : 4 * 1024 * 1024;
        if (acceptedFile[0].size > maxBytes) {
          return toast({
            title: "File Size Limit Exceeded",
            description: `This file is ${(
              acceptedFile[0].size /
              (1024 * 1024)
            ).toFixed(1)}MB. Your ${
              isSubscribed ? "PRO" : "Free"
            } plan limit is ${isSubscribed ? "16MB" : "4MB"}.${
              !isSubscribed ? " Upgrade to PRO for up to 16MB files." : ""
            }`,
            variant: "destructive",
          });
        }

        setIsUploading(true);
        const progressInterval = startSimulatedProgress();

        const isLocalhost =
          typeof window !== "undefined" &&
          (window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1");

        // 1. Only attempt local disk upload when developing locally on localhost
        if (isLocalhost) {
          try {
            const formData = new FormData();
            formData.append("file", acceptedFile[0]);

            const res = await fetch("/api/upload", {
              method: "POST",
              body: formData,
            });

            if (res.ok) {
              const data = await res.json();
              if (data.file?.id) {
                clearInterval(progressInterval);
                setUploadProgress(100);
                await utils.getUserFiles.invalidate();
                router.refresh();
                if (closeDialog) closeDialog();
                router.push(`/dashboard/${data.file.id}`);
                return;
              }
            } else {
              const errData = await res.json().catch(() => ({}));
              // Only abort if it's an intentional user quota / plan limit rejection:
              if (
                res.status === 403 ||
                errData.quotaExceeded ||
                errData.pagesExceeded ||
                errData.fileSizeExceeded
              ) {
                clearInterval(progressInterval);
                setIsUploading(false);
                return toast({
                  title: "Upload Rejected",
                  description:
                    errData.error ||
                    "Failed to upload document within current plan limits.",
                  variant: "destructive",
                });
              }
              // If it was a filesystem / server error, seamlessly fall through to UploadThing!
            }
          } catch (localErr) {
            console.warn(
              "Local upload notice, falling back to UploadThing:",
              localErr
            );
          }
        }

        // 2. Cloud Upload via UploadThing (Primary for Vercel & Production)
        try {
          const res = await startUpload(acceptedFile);
          if (!res) {
            clearInterval(progressInterval);
            setIsUploading(false);
            return toast({
              title: "Upload failed",
              description:
                "Please check your file and plan limits, then try again",
              variant: "destructive",
            });
          }

          const [fileResponse] = res;
          const key = fileResponse?.key;

          if (!key) {
            clearInterval(progressInterval);
            setIsUploading(false);
            return toast({
              title: "Upload failed",
              description: "Please try again later",
              variant: "destructive",
            });
          }

          clearInterval(progressInterval);
          setUploadProgress(100);
          startPolling({ key });
        } catch (uploadThingErr: any) {
          clearInterval(progressInterval);
          setIsUploading(false);
          console.error("UploadThing error:", uploadThingErr);
          return toast({
            title: "Upload failed",
            description:
              uploadThingErr?.message ||
              "Please check your file and network connection, then try again",
            variant: "destructive",
          });
        }
      }}
    >
      {({ getRootProps, getInputProps, acceptedFiles }) => (
        <div
          {...getRootProps()}
          className="border h-64 m-4 border-dashed border-gray-300 rounded-lg"
        >
          <div className="flex items-center justify-center h-full w-full">
            <label
              htmlFor="dropzone-file"
              className="flex flex-col items-center justify-center w-full h-full rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Cloud className="h-6 w-6 text-zinc-500 mb-2" />
                <p className="mb-2 text-sm text-zinc-700">
                  <span className="font-semibold">Click to upload</span> or drag
                  and drop
                </p>
                <p className="text-xs text-zinc-500">
                  PDF, Word (.docx) or PowerPoint (.pptx) up to{" "}
                  {isSubscribed ? "16" : "4"}MB
                </p>
              </div>
              {acceptedFiles && acceptedFiles[0] ? (
                <div className="max-w-xs bg-white flex items-center rounded-md overflow-hidden outline-[1px] outline-zinc-200 divide-x divide-zinc-200">
                  <div className="px-3 py-2 h-full grid place-items-center">
                    {acceptedFiles[0].name.endsWith(".docx") ||
                    acceptedFiles[0].name.endsWith(".doc") ? (
                      <FileText className="h-4 w-4 text-blue-600" />
                    ) : acceptedFiles[0].name.endsWith(".pptx") ||
                      acceptedFiles[0].name.endsWith(".ppt") ? (
                      <Presentation className="h-4 w-4 text-orange-600" />
                    ) : (
                      <File className="h-4 w-4 text-blue-500" />
                    )}
                  </div>
                  <div className="px-3 py-2 h-full text-sm truncate">
                    {acceptedFiles[0].name}
                  </div>
                </div>
              ) : null}

              {isUploading ? (
                <div className="w-full mt-4 max-w-xs mx-auto">
                  <Progress
                    indicatorColor={
                      uploadProgress === 100 ? "bg-green-500" : ""
                    }
                    value={uploadProgress}
                    className="h-1 w-full bg-zinc-200"
                  />
                  {uploadProgress === 100 ? (
                    <div className="flex gap-1 items-center justify-center text-sm text-zinc-700 text-center pt-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Redirecting...
                    </div>
                  ) : null}
                </div>
              ) : null}
              <input
                {...getInputProps()}
                type="file"
                id="dropzone-file"
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}
    </DropZone>
  );
};

function UploadButton({
  isSubscribed,
  currentFilesCount = 0,
  maxQuota = 10,
}: {
  isSubscribed: boolean;
  currentFilesCount?: number;
  maxQuota?: number;
}) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const router = useRouter();
  const isQuotaReached = currentFilesCount >= maxQuota;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(v) => {
        if (!v) {
          setIsOpen(v);
        }
      }}
    >
      <DialogTrigger asChild onClick={() => setIsOpen(true)}>
        <Button>Upload file</Button>
      </DialogTrigger>
      <DialogContent>
        {isQuotaReached ? (
          <div className="p-4 flex flex-col items-center text-center">
            <div className="rounded-full bg-blue-100 p-3 mb-3">
              <Gem className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="font-semibold text-lg text-zinc-900 mb-1">
              Document Quota Reached
            </h3>
            <p className="text-sm text-zinc-600 mb-5 max-w-sm">
              You have uploaded {currentFilesCount} of {maxQuota} documents
              included in your <strong>{isSubscribed ? "PRO" : "Free"}</strong>{" "}
              plan.
              {!isSubscribed &&
                " Upgrade to PRO to unlock 50 documents, 16MB file size, and higher-quality AI responses."}
            </p>
            <div className="flex gap-3 w-full sm:w-auto">
              {!isSubscribed ? (
                <Button
                  onClick={() => {
                    setIsOpen(false);
                    router.push("/pricing");
                  }}
                  className="w-full sm:w-auto"
                >
                  View Pro Plan <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                  className="w-full sm:w-auto"
                >
                  Close
                </Button>
              )}
            </div>
          </div>
        ) : (
          <UploadDropZone
            isSubscribed={isSubscribed}
            closeDialog={() => setIsOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default UploadButton;
