import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Expand, FileText, Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useResizeDetector } from "react-resize-detector";
import SimpleBar from "simplebar-react";
import { useToast } from "@/components/ui/use-toast";

pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.js`;

interface PdfFullscreenProps {
  fileUrl: string;
}
const PdfFullscreen = ({ fileUrl }: PdfFullscreenProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [numPages, setNumPages] = useState<number>();
  const [scale, setScale] = useState<number>(1);
  const [windowWidth, setWindowWidth] = useState<number>(0);

  const { toast } = useToast();

  const { width, ref } = useResizeDetector();

  useEffect(() => {
    const updateWidth = () => setWindowWidth(window.innerWidth);
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [isOpen]);

  const effectiveWidth =
    width || (windowWidth ? Math.min(windowWidth - 28, 1220) : 900);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(v) => setIsOpen(v)}
    >
      <DialogTrigger onClick={() => setIsOpen(true)} asChild>
        <Button
          variant="ghost"
          className="gap-1.5 px-1.5 sm:px-2.5 h-8"
          aria-label="fullscreen"
          title="Expand PDF view"
        >
          <Expand className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[98vw] max-w-[98vw] sm:max-w-[95vw] xl:max-w-7xl h-[92dvh] sm:h-[92vh] p-2 sm:p-5 flex flex-col overflow-hidden gap-0">
        <div className="shrink-0 flex items-center justify-between pb-2.5 border-b border-zinc-200 pr-8 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200 shrink-0">
              <FileText className="h-3.5 w-3.5 text-blue-600" />
              <span>PDF Document</span>
            </div>
            {numPages && (
              <span className="text-xs text-zinc-500 font-medium">
                {numPages} {numPages === 1 ? "page" : "pages"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 sm:h-8 gap-1 text-xs px-2"
                >
                  <Search className="h-3.5 w-3.5" />
                  {Math.round(scale * 100)}%
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setScale(0.75)}>
                  75%
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setScale(1)}>
                  100% (Fit)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setScale(1.25)}>
                  125%
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setScale(1.5)}>
                  150%
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setScale(2)}>
                  200%
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <SimpleBar
          autoHide={false}
          className="flex-1 min-h-0 max-h-[calc(92dvh-6.5rem)] w-full mt-2 bg-zinc-100/70 rounded-lg"
        >
          <div ref={ref} className="w-full overflow-x-auto p-0.5 sm:p-4">
            <Document
              loading={
                <div className="flex justify-center">
                  <Loader2 className="my-24 h-6 w-6 animate-spin text-blue-600" />
                </div>
              }
              onLoadError={() => {
                toast({
                  title: "Error loading PDF",
                  description: "Please try again later",
                  variant: "destructive",
                });
              }}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
              file={fileUrl}
              className="max-h-full"
            >
              {new Array(numPages).fill(0).map((_, i) => (
                <div key={i} className="mb-4 last:mb-0 flex justify-center">
                  <Page
                    width={effectiveWidth}
                    scale={scale}
                    pageNumber={i + 1}
                    className="shadow-md"
                  />
                </div>
              ))}
            </Document>
          </div>
        </SimpleBar>
      </DialogContent>
    </Dialog>
  );
};

export default PdfFullscreen;
