"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";
import { useUploadThing } from "@/lib/uploadthing";
import { DialogTrigger } from "@radix-ui/react-dialog";
import {
  Cloud,
  File,
  Loader2,
  FileText,
  Presentation,
} from "lucide-react";
import { useState } from "react";
import DropZone from "react-dropzone";
import { trpc } from "../_trpc/client";
import { useRouter } from "next/navigation";
import { DynamicPlan } from "@/lib/subscription";
import LimitUpgradePrompt, { LimitType } from "./LimitUpgradePrompt";

const UploadDropZone = ({
  isSubscribed,
  maxFileSizeMB = isSubscribed ? 16 : 4,
  planName = isSubscribed ? "Pro" : "Free",
  upgradePlan,
  closeDialog,
}: {
  isSubscribed: boolean;
  maxFileSizeMB?: number;
  planName?: string;
  upgradePlan?: DynamicPlan | null;
  closeDialog?: () => void;
}) => {
  const router = useRouter();
  const utils = trpc.useContext();

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadThingError, setUploadThingError] = useState<string | null>(null);
  const [limitError, setLimitError] = useState<{
    type: LimitType;
    title: string;
    description: string;
  } | null>(null);
  const { toast } = useToast();
  const { startUpload } = useUploadThing(
    isSubscribed ? "proPlanUploader" : "freePlanUploader",
    {
      onUploadError: (err) => {
        console.error("[UploadThing] Error:", err);
        const msg = err.message || "UploadThing upload failed";
        setUploadThingError(msg);
        if (/quota|size|limit|exceed|maximum/i.test(msg)) {
          setLimitError({
            type: /quota|maximum/i.test(msg) ? "quota" : "fileSize",
            title: /quota/i.test(msg)
              ? "Document Quota Reached"
              : "Plan Limit Exceeded",
            description: msg,
          });
        }
      },
    }
  );

  const { mutate: startPolling } = trpc.getFile.useMutation({
    onSuccess: (file) => {
      utils.getUserFiles.invalidate();
      router.refresh();
      setIsUploading(false);
      if (closeDialog) closeDialog();
      toast({
        title: "Document uploaded",
        description: `${file?.name || "Your document"} has been added to your dashboard.`,
      });
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

  if (limitError) {
    return (
      <div className="p-2 sm:p-4">
        <LimitUpgradePrompt
          variant="card"
          limitType={limitError.type}
          reasonTitle={limitError.title}
          reasonDescription={limitError.description}
          currentPlanName={planName}
          isSubscribed={isSubscribed}
          upgradePlan={upgradePlan}
          onNavigate={() => closeDialog?.()}
          secondaryAction={{
            label: "Try Another File",
            onClick: () => setLimitError(null),
          }}
        />
      </div>
    );
  }

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

        // Client-side file size check using live plan maxFileSizeMB
        const maxBytes = maxFileSizeMB * 1024 * 1024;
        if (acceptedFile[0].size > maxBytes) {
          const fileMB = (acceptedFile[0].size / (1024 * 1024)).toFixed(1);
          const desc = `This file is ${fileMB}MB. Your ${planName} plan limit is ${maxFileSizeMB}MB.${
            !isSubscribed && upgradePlan
              ? ` Upgrade to ${upgradePlan.name} for up to ${upgradePlan.maxFileSizeMB}MB files.`
              : ""
          }`;
          setLimitError({
            type: "fileSize",
            title: "File Size Limit Exceeded",
            description: `${acceptedFile[0].name} is ${fileMB}MB, above your ${planName} plan's ${maxFileSizeMB}MB file limit.`,
          });
          return toast({
            title: "File Size Limit Exceeded",
            description: desc,
            variant: "destructive",
            action: !isSubscribed ? (
              <ToastAction
                altText="See Pricing"
                onClick={() => {
                  if (closeDialog) closeDialog();
                  router.push("/pricing");
                }}
              >
                See Pricing
              </ToastAction>
            ) : undefined,
          });
        }

        setIsUploading(true);
        const progressInterval = startSimulatedProgress();

        // 1. Primary Direct Cloud Upload via MongoDB Atlas (Ultra-reliable, zero 3rd-party filehost dependencies)
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
              setIsUploading(false);
              if (closeDialog) closeDialog();
              toast({
                title: "Document uploaded",
                description: `${acceptedFile[0].name} has been added to your dashboard.`,
              });
              return;
            }
          } else {
            const errData = await res.json().catch(() => ({}));
            // Only halt if it's an intentional user quota / plan limit / validation rejection:
            const isLimitRejection = Boolean(
              errData.quotaExceeded ||
                errData.pagesExceeded ||
                errData.fileSizeExceeded ||
                res.status === 403 ||
                /quota|limit|exceed|upgrade/i.test(errData.error || "")
            );

            if (
              res.status === 400 ||
              res.status === 403 ||
              isLimitRejection
            ) {
              clearInterval(progressInterval);
              setIsUploading(false);
              const errMsg =
                errData.error ||
                "Failed to upload document within current plan limits.";

              if (isLimitRejection) {
                const type: LimitType = errData.quotaExceeded
                  ? "quota"
                  : errData.pagesExceeded
                    ? "pages"
                    : errData.fileSizeExceeded
                      ? "fileSize"
                      : "generic";
                const title =
                  type === "quota"
                    ? "Document Quota Reached"
                    : type === "pages"
                      ? "Page Limit Exceeded"
                      : type === "fileSize"
                        ? "File Size Limit Exceeded"
                        : "Plan Limit Reached";
                setLimitError({
                  type,
                  title,
                  description: errMsg,
                });
              }

              return toast({
                title: isLimitRejection ? "Plan Limit Reached" : "Upload Rejected",
                description: errMsg,
                variant: "destructive",
                action:
                  isLimitRejection && !isSubscribed ? (
                    <ToastAction
                      altText="See Pricing"
                      onClick={() => {
                        if (closeDialog) closeDialog();
                        router.push("/pricing");
                      }}
                    >
                      See Pricing
                    </ToastAction>
                  ) : undefined,
              });
            }
            console.warn(
              "Direct storage notice, attempting UploadThing secondary fallback:",
              errData
            );
          }
        } catch (directErr) {
          console.warn(
            "Direct storage error, falling back to UploadThing:",
            directErr
          );
        }

        // 2. Secondary Cloud Upload via UploadThing (Fallback)
        try {
          setUploadThingError(null);
          const res = await startUpload(acceptedFile);
          if (!res) {
            clearInterval(progressInterval);
            setIsUploading(false);
            const fallbackMsg =
              uploadThingError ||
              "Upload failed. Please check your document size and plan limits, then try again.";
            return toast({
              title: "Upload Failed",
              description: fallbackMsg,
              variant: "destructive",
              action: !isSubscribed ? (
                <ToastAction
                  altText="See Pricing"
                  onClick={() => {
                    if (closeDialog) closeDialog();
                    router.push("/pricing");
                  }}
                >
                  See Pricing
                </ToastAction>
              ) : undefined,
            });
          }

          const [fileResponse] = res;
          const key = fileResponse?.key;

          if (!key) {
            clearInterval(progressInterval);
            setIsUploading(false);
            return toast({
              title: "Upload Failed",
              description: "Could not generate file key. Please try again later.",
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
            title: "Upload Failed",
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
                  {maxFileSizeMB}MB
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
                      Finalizing upload...
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
  maxFileSizeMB = isSubscribed ? 16 : 4,
  planName = isSubscribed ? "Pro" : "Free",
  upgradePlan = null,
}: {
  isSubscribed: boolean;
  currentFilesCount?: number;
  maxQuota?: number;
  maxFileSizeMB?: number;
  planName?: string;
  upgradePlan?: DynamicPlan | null;
}) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {isQuotaReached ? (
          <div className="p-2 sm:p-4">
            <LimitUpgradePrompt
              variant="card"
              limitType="quota"
              reasonTitle="Document Quota Reached"
              reasonDescription={`You have uploaded ${currentFilesCount} of ${maxQuota} documents included in your ${planName} plan.`}
              currentPlanName={planName}
              isSubscribed={isSubscribed}
              upgradePlan={upgradePlan}
              onNavigate={() => setIsOpen(false)}
              secondaryAction={{
                label: "Manage Files",
                onClick: () => setIsOpen(false),
              }}
            />
          </div>
        ) : (
          <UploadDropZone
            isSubscribed={isSubscribed}
            maxFileSizeMB={maxFileSizeMB}
            planName={planName}
            upgradePlan={upgradePlan}
            closeDialog={() => setIsOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default UploadButton;
