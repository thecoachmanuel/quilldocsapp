"use client";

import { useState } from "react";
import { trpc } from "@/app/_trpc/client";
import Link from "next/link";
import {
  CreditCard,
  Plus,
  Edit3,
  Trash2,
  Check,
  Sparkles,
  RotateCcw,
  ExternalLink,
  Loader2,
  ArrowUp,
  ArrowDown,
  X,
  Users,
  FileText,
  HardDrive,
  Layers,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import Skeleton from "react-loading-skeleton";

export default function PlansManagement() {
  const { toast } = useToast();
  const utils = trpc.useContext();

  const { data: plans, isLoading } = trpc.adminGetPlans.useQuery(undefined, {
    refetchOnMount: "always",
  });

  // Modal state for Create / Edit Plan
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [planId, setPlanId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [tagline, setTagline] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [priceNgn, setPriceNgn] = useState<number>(0);
  const [quota, setQuota] = useState<number>(10);
  const [pagesPerPdf, setPagesPerPdf] = useState<number>(5);
  const [maxFileSizeMB, setMaxFileSizeMB] = useState<number>(4);
  const [stripePriceId, setStripePriceId] = useState("");
  const [isPopular, setIsPopular] = useState(false);
  const [features, setFeatures] = useState<string[]>([]);
  const [newFeatureInput, setNewFeatureInput] = useState("");

  // Reset confirmation modal
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  const invalidateAll = () => {
    utils.adminGetPlans.invalidate();
    utils.getPublicPlans.invalidate();
    utils.adminGetOverview.invalidate();
    utils.adminGetUsers.invalidate();
  };

  const createPlanMutation = trpc.adminCreatePlan.useMutation({
    onSuccess: (created) => {
      toast({
        title: "Plan created",
        description: `${created.name} tier is now live across the platform.`,
      });
      setIsModalOpen(false);
      invalidateAll();
    },
    onError: (err) => {
      toast({
        title: "Failed to create plan",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updatePlanMutation = trpc.adminUpdatePlan.useMutation({
    onSuccess: (updated) => {
      toast({
        title: "Plan & features saved",
        description: `${updated.name} configuration and feature list updated.`,
      });
      setIsModalOpen(false);
      invalidateAll();
    },
    onError: (err) => {
      toast({
        title: "Failed to update plan",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deletePlanMutation = trpc.adminDeletePlan.useMutation({
    onSuccess: () => {
      toast({
        title: "Plan deleted",
        description: "The custom subscription plan was removed.",
      });
      invalidateAll();
    },
    onError: (err) => {
      toast({
        title: "Cannot delete plan",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const resetPlansMutation = trpc.adminResetDefaultPlans.useMutation({
    onSuccess: () => {
      toast({
        title: "Default plans restored",
        description: "Free and Pro tiers have been reset to factory defaults.",
      });
      setIsResetConfirmOpen(false);
      invalidateAll();
    },
    onError: (err) => {
      toast({
        title: "Reset failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const openCreateModal = () => {
    setIsEditing(false);
    setPlanId("");
    setName("");
    setSlug("");
    setTagline("For growing teams and heavy document workflows.");
    setPrice(29);
    setPriceNgn(35000);
    setQuota(100);
    setPagesPerPdf(50);
    setMaxFileSizeMB(32);
    setStripePriceId("");
    setIsPopular(false);
    setFeatures([
      "100 documents quota",
      "50 pages or slides per document",
      "32MB file size limit (PDF, DOCX, PPTX)",
      "Priority AI responses with source citations",
      "Dedicated support",
    ]);
    setNewFeatureInput("");
    setIsModalOpen(true);
  };

  const openEditModal = (plan: any) => {
    setIsEditing(true);
    setPlanId(plan.id || `plan_${plan.slug}`);
    setName(plan.name || "");
    setSlug(plan.slug || "");
    setTagline(plan.tagline || "");
    setPrice(Number(plan.price?.amount ?? 0));
    setPriceNgn(Number(plan.price?.amountNgn ?? (plan.slug === "pro" ? 18000 : 0)));
    setQuota(Number(plan.quota ?? 10));
    setPagesPerPdf(Number(plan.pagesPerPdf ?? 5));
    setMaxFileSizeMB(Number(plan.maxFileSizeMB ?? 4));
    setStripePriceId(plan.price?.priceIds?.test || "");
    setIsPopular(Boolean(plan.isPopular));
    setFeatures(Array.isArray(plan.features) ? [...plan.features] : []);
    setNewFeatureInput("");
    setIsModalOpen(true);
  };

  const handleAddFeature = () => {
    const trimmed = newFeatureInput.trim();
    if (!trimmed) return;
    setFeatures((prev) => [...prev, trimmed]);
    setNewFeatureInput("");
  };

  const handleUpdateFeatureText = (idx: number, val: string) => {
    setFeatures((prev) => prev.map((f, i) => (i === idx ? val : f)));
  };

  const handleRemoveFeature = (idx: number) => {
    setFeatures((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleMoveFeature = (idx: number, direction: "up" | "down") => {
    setFeatures((prev) => {
      const copy = [...prev];
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= copy.length) return prev;
      const temp = copy[idx];
      copy[idx] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  const handleSavePlan = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedFeatures = features
      .map((f) => f.trim())
      .filter((f) => f.length > 0);

    if (isEditing) {
      updatePlanMutation.mutate({
        id: planId,
        slug,
        name,
        tagline,
        price,
        priceNgn,
        quota,
        pagesPerPdf,
        maxFileSizeMB,
        features: cleanedFeatures,
        isPopular,
        stripePriceId,
      });
    } else {
      createPlanMutation.mutate({
        name,
        slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        tagline,
        price,
        priceNgn,
        quota,
        pagesPerPdf,
        maxFileSizeMB,
        features: cleanedFeatures,
        isPopular,
        stripePriceId,
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
            Plans & Features Configuration
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Customize pricing, upload quotas, page limits, and feature checklists. Changes sync directly with{" "}
            <Link href="/pricing" className="text-blue-600 underline font-medium">
              /pricing
            </Link>{" "}
            and document upload enforcement.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/pricing"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-9 gap-1.5 bg-white border-zinc-200 text-zinc-700"
            )}
          >
            View Live Pricing
            <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsResetConfirmOpen(true)}
            className="h-9 gap-1.5 bg-white border-zinc-200 text-zinc-700"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Defaults
          </Button>

          <Button
            size="sm"
            onClick={openCreateModal}
            className="h-9 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4" />
            New Plan Tier
          </Button>
        </div>
      </div>

      {/* Plans Grid */}
      {isLoading || !plans ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton height={420} className="rounded-2xl" />
          <Skeleton height={420} className="rounded-2xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan: any) => (
            <div
              key={plan.slug}
              className={cn(
                "relative flex flex-col justify-between rounded-2xl bg-white p-6 shadow-sm transition hover:shadow-md",
                plan.isPopular
                  ? "border-2 border-blue-600 shadow-blue-100/50"
                  : "border border-zinc-200"
              )}
            >
              {plan.isPopular && (
                <div className="absolute -top-3.5 left-6 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-3 py-0.5 text-xs font-semibold text-white shadow-sm">
                  <Sparkles className="h-3 w-3" />
                  Highlighted / Popular
                </div>
              )}

              <div>
                {/* Top Row: Name, Slug & Subscriber Count */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-bold text-zinc-900">
                        {plan.name}
                      </h2>
                      <code className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-mono text-zinc-600 border border-zinc-200">
                        {plan.slug}
                      </code>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                      {plan.tagline || "Standard subscription plan"}
                    </p>
                  </div>

                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 border border-zinc-200 shrink-0">
                    <Users className="h-3.5 w-3.5 text-blue-600" />
                    {plan.subscribersCount} users
                  </span>
                </div>

                {/* Price Display */}
                <div className="mt-5 flex items-baseline gap-2 border-b border-zinc-100 pb-5">
                  <span className="text-3xl font-extrabold text-zinc-900">
                    ₦{(plan.price.amountNgn ?? 0).toLocaleString()}
                  </span>
                  <span className="text-sm font-medium text-zinc-500">
                    / mo (${plan.price.amount} USD)
                  </span>
                </div>

                {/* Hard Technical Quotas */}
                <div className="mt-5 grid grid-cols-3 gap-2 rounded-xl bg-zinc-50 p-3 border border-zinc-200/80 text-center">
                  <div>
                    <div className="flex items-center justify-center gap-1 text-[11px] font-medium text-zinc-500">
                      <FileText className="h-3 w-3 text-blue-600" />
                      Quota
                    </div>
                    <p className="mt-0.5 text-sm font-bold text-zinc-900">
                      {plan.quota} files
                    </p>
                  </div>

                  <div className="border-x border-zinc-200/80">
                    <div className="flex items-center justify-center gap-1 text-[11px] font-medium text-zinc-500">
                      <Layers className="h-3 w-3 text-blue-600" />
                      Pages/Doc
                    </div>
                    <p className="mt-0.5 text-sm font-bold text-zinc-900">
                      {plan.pagesPerPdf} pages
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-center gap-1 text-[11px] font-medium text-zinc-500">
                      <HardDrive className="h-3 w-3 text-blue-600" />
                      Max Size
                    </div>
                    <p className="mt-0.5 text-sm font-bold text-zinc-900">
                      {plan.maxFileSizeMB} MB
                    </p>
                  </div>
                </div>

                {/* Feature Checklist */}
                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
                    Included Plan Features ({plan.features?.length || 0})
                  </p>
                  <ul className="space-y-2.5 text-sm text-zinc-700">
                    {(plan.features || []).map((feat: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                          <Check className="h-3 w-3" />
                        </div>
                        <span className="leading-snug">{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="mt-6 flex items-center justify-between gap-2 border-t border-zinc-100 pt-4">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => openEditModal(plan)}
                  className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white gap-1.5"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit Plan & Features
                </Button>

                {plan.slug !== "free" && plan.slug !== "pro" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deletePlanMutation.mutate({ slug: plan.slug })}
                    disabled={deletePlanMutation.isLoading}
                    className="border-red-200 text-red-600 hover:bg-red-50 px-2.5"
                    title="Delete custom plan"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* =====================================================================
          CREATE / EDIT PLAN & FEATURES MODAL
         ===================================================================== */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-zinc-900">
              <CreditCard className="h-5 w-5 text-blue-600" />
              {isEditing
                ? `Edit ${name} Plan & Features`
                : "Create New Subscription Plan"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSavePlan} className="space-y-5 mt-2">
            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Plan Display Name
                </label>
                <Input
                  required
                  placeholder="e.g. Pro, Team, Enterprise"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Plan Slug (Identifier)
                </label>
                <Input
                  required
                  disabled={isEditing}
                  placeholder="e.g. pro, team"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Pricing Card Tagline
              </label>
              <Input
                placeholder="Short description shown on the /pricing page"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
              />
            </div>

            {/* Quotas & Price */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 rounded-xl bg-zinc-50 p-4 border border-zinc-200">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Price (₦ NGN / mo)
                </label>
                <Input
                  type="number"
                  min={0}
                  step="100"
                  required
                  value={priceNgn}
                  onChange={(e) => setPriceNgn(Number(e.target.value))}
                  className="bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Price ($ USD / mo)
                </label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className="bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  File Quota
                </label>
                <Input
                  type="number"
                  min={1}
                  required
                  value={quota}
                  onChange={(e) => setQuota(Number(e.target.value))}
                  className="bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Pages / Doc
                </label>
                <Input
                  type="number"
                  min={1}
                  required
                  value={pagesPerPdf}
                  onChange={(e) => setPagesPerPdf(Number(e.target.value))}
                  className="bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Max Size (MB)
                </label>
                <Input
                  type="number"
                  min={1}
                  required
                  value={maxFileSizeMB}
                  onChange={(e) => setMaxFileSizeMB(Number(e.target.value))}
                  className="bg-white"
                />
              </div>
            </div>

            {/* Stripe Price ID & Highlight Toggle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Stripe Price ID (Optional)
                </label>
                <Input
                  placeholder="price_1O..."
                  value={stripePriceId}
                  onChange={(e) => setStripePriceId(e.target.value)}
                />
              </div>

              <div className="pt-4">
                <label className="flex items-center gap-2.5 cursor-pointer select-none rounded-lg border border-zinc-200 p-2.5 hover:bg-zinc-50">
                  <input
                    type="checkbox"
                    checked={isPopular}
                    onChange={(e) => setIsPopular(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-semibold text-zinc-800">
                    Highlight with &ldquo;Popular / Upgrade&rdquo; badge on Pricing page
                  </span>
                </label>
              </div>
            </div>

            {/* Interactive Plan Features Manager */}
            <div className="space-y-3 border-t border-zinc-200 pt-4">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700">
                  Plan Features List ({features.length})
                </label>
                <span className="text-[11px] text-zinc-500">
                  Displayed on Pricing cards & Billing page
                </span>
              </div>

              {/* Add new feature row */}
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Add a plan feature (e.g. 'Priority AI responses with citations')..."
                  value={newFeatureInput}
                  onChange={(e) => setNewFeatureInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddFeature();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddFeature}
                  className="shrink-0 gap-1 border-blue-200 text-blue-600 hover:bg-blue-50"
                >
                  <Plus className="h-4 w-4" />
                  Add Feature
                </Button>
              </div>

              {/* Existing features list */}
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {features.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic py-3 text-center">
                    No features added yet. Add a feature above.
                  </p>
                ) : (
                  features.map((feat, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50/60 p-1.5"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-blue-50 text-blue-600 text-xs font-bold">
                        {idx + 1}
                      </span>
                      <Input
                        value={feat}
                        onChange={(e) =>
                          handleUpdateFeatureText(idx, e.target.value)
                        }
                        className="h-8 text-xs bg-white flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => handleMoveFeature(idx, "up")}
                        disabled={idx === 0}
                        className="p-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                        title="Move up"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveFeature(idx, "down")}
                        disabled={idx === features.length - 1}
                        className="p-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                        title="Move down"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveFeature(idx)}
                        className="p-1 text-red-500 hover:text-red-700"
                        title="Remove feature"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createPlanMutation.isLoading || updatePlanMutation.isLoading
                }
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {(createPlanMutation.isLoading ||
                  updatePlanMutation.isLoading) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEditing ? "Save Plan & Features" : "Create Plan"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* =====================================================================
          RESET TO DEFAULT PLANS MODAL
         ===================================================================== */}
      <Dialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-zinc-900">
              <RotateCcw className="h-5 w-5 text-blue-600" />
              Restore Default Plans
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600 mt-1">
            This will reset the <strong>Free</strong> ($0/mo, 10 files, 4MB) and{" "}
            <strong>Pro</strong> ($14/mo, 50 files, 16MB) plans and their feature
            lists back to factory defaults.
          </p>
          <div className="flex items-center justify-end gap-2 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsResetConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={resetPlansMutation.isLoading}
              onClick={() => resetPlansMutation.mutate()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {resetPlansMutation.isLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Restore Defaults
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

