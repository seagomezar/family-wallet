import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState, useCallback, useMemo } from "react";
import Papa from "papaparse";
import { db, type BankTransaction, type Category } from "@/db/schema";
import { formatCOP, toMonthKey } from "@/lib/currency";
import {
  detectFileType,
  type ParsedTransaction,
  type ParsedStatement,
} from "@/lib/pdf-parse-utils";
import {
  categorizeBatch,
  createUserRule,
  suggestPattern,
  type CategorizationResult,
} from "@/lib/categorization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Upload,
  Check,
  X,
  FileUp,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  FileText,
  Sparkles,
  HelpCircle,
  Ban,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/importar")({
  component: ImportarPage,
});

// ─── Types ───────────────────────────────────────────────────────────

type ImportStep = "upload" | "review" | "confirm";

interface CategorizedTransaction {
  parsed: ParsedTransaction;
  categorization: CategorizationResult;
  userCategoryId?: string; // user override
  remember: boolean; // create rule for this
  skip: boolean; // user chose to skip
}

// ─── Main Component ──────────────────────────────────────────────────

function ImportarPage() {
  const [step, setStep] = useState<ImportStep>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [statement, setStatement] = useState<ParsedStatement | null>(null);
  const [categorized, setCategorized] = useState<CategorizedTransaction[]>([]);
  const [importResult, setImportResult] = useState<{
    count: number;
    month: string;
  } | null>(null);

  // CSV fallback state
  const [csvRows, setCsvRows] = useState<CsvParsedRow[]>([]);

  const categories = useLiveQuery(() =>
    db.categories.orderBy("order").toArray(),
  );

  // ─── File handling ─────────────────────────────────────────────────

  const handleCsvFile = useCallback((file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: "",
      complete: (results) => {
        setIsProcessing(false);
        if (results.errors.length > 0) {
          setError(
            `Error al parsear: ${results.errors[0]?.message ?? "Error desconocido"}`,
          );
          return;
        }

        const rows: CsvParsedRow[] = results.data
          .map((row) => {
            const keys = Object.keys(row);
            const get = (patterns: string[]) => {
              const key = keys.find((k) =>
                patterns.some((p) => k.toUpperCase().includes(p)),
              );
              return key ? (row[key] ?? "").trim() : "";
            };

            const valorStr = get(["VALOR", "MONTO", "AMOUNT"]);
            const valor = parseFloat(
              valorStr.replace(/[,$\s]/g, "").replace(/\./g, ""),
            );

            return {
              fecha: get(["FECHA", "DATE"]),
              documento: get(["DOCUMENTO", "DOC"]),
              oficina: get(["OFICINA", "OFFICE"]),
              descripcion: get(["DESCRIPCI", "DESCRIPTION", "DESC"]),
              referencia: get(["REFERENCIA", "REF"]),
              valor: isNaN(valor) ? 0 : valor,
            };
          })
          .filter((r) => r.descripcion && r.valor !== 0);

        if (rows.length === 0) {
          setError("No se encontraron transacciones válidas en el archivo.");
          return;
        }

        setCsvRows(rows);
        setStep("review");
      },
      error: (err) => {
        setIsProcessing(false);
        setError(`Error leyendo archivo: ${err.message}`);
      },
    });
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setFileName(file.name);
      setIsProcessing(true);
      setCsvRows([]);
      setStatement(null);

      const fileType = detectFileType(file);

      if (fileType === "pdf") {
        const { parseDavibankPDF } = await import("@/lib/pdf-parser");
        const result = await parseDavibankPDF(file);
        if (!result.success) {
          setError(
            result.error.message +
              (result.error.details ? `: ${result.error.details}` : ""),
          );
          setIsProcessing(false);
          return;
        }

        setStatement(result.statement);

        // Auto-categorize all transactions
        const descriptions = result.statement.transactions.map(
          (t) => t.description,
        );
        const results = await categorizeBatch(descriptions);

        const categorizedTxs: CategorizedTransaction[] =
          result.statement.transactions.map((tx, i) => {
            const cat = results[i] ?? {
              categoryId: null,
              confidence: "none" as const,
              matchedRule: null,
              isTransfer: false,
              isBankFee: false,
            };
            return {
              parsed: tx,
              categorization: cat,
              remember: false,
              skip: cat.isTransfer || cat.isBankFee,
            };
          });

        setCategorized(categorizedTxs);
        setStep("review");
        setIsProcessing(false);
      } else if (fileType === "csv" || fileType === "tsv") {
        // Legacy CSV/TSV import
        handleCsvFile(file);
      } else {
        setError("Formato no soportado. Usa archivos PDF, CSV o TSV.");
        setIsProcessing(false);
      }
    },
    [handleCsvFile],
  );

  // ─── Multi-file handling ───────────────────────────────────────────

  const handleFiles = useCallback(
    async (files: FileList) => {
      if (files.length === 1 && files[0]) {
        handleFile(files[0]);
      } else {
        // For now, process first PDF
        const pdfFile = Array.from(files).find(
          (f) => detectFileType(f) === "pdf",
        );
        if (pdfFile) {
          handleFile(pdfFile);
        } else if (files[0]) {
          handleFile(files[0]);
        }
      }
    },
    [handleFile],
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  }

  // ─── Review step actions ───────────────────────────────────────────

  function updateTransaction(
    index: number,
    updates: Partial<CategorizedTransaction>,
  ) {
    setCategorized((prev) =>
      prev.map((tx, i) => (i === index ? { ...tx, ...updates } : tx)),
    );
  }

  // ─── Import action ────────────────────────────────────────────────

  async function handleImport() {
    setIsProcessing(true);

    try {
      const toImport = categorized.filter((tx) => !tx.skip);
      const batchId = `import-${Date.now()}`;
      const month = statement?.period ?? toMonthKey(new Date());

      // Ensure budget exists for the month
      const existingBudget = await db.budgets
        .where("month")
        .equals(month)
        .first();
      let budgetId: string;
      if (!existingBudget) {
        budgetId = `budget-${month}`;
        await db.budgets.add({
          id: budgetId,
          month,
          totalIncome: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } else {
        budgetId = existingBudget.id;
      }

      // Create bank transactions
      const transactions: BankTransaction[] = toImport.map((tx, i) => ({
        id: `tx-${batchId}-${i}`,
        importBatch: batchId,
        transactionDate: tx.parsed.date,
        description: tx.parsed.description,
        reference: "",
        amount: tx.parsed.amount,
        office: tx.parsed.office,
        categoryId:
          tx.userCategoryId ?? tx.categorization.categoryId ?? undefined,
        status: "accepted" as const,
        importedAt: new Date(),
      }));

      await db.bankTransactions.bulkAdd(transactions);

      // Create expense records for categorized transactions
      const expenses = toImport
        .filter((tx) => {
          const catId = tx.userCategoryId ?? tx.categorization.categoryId;
          return catId && tx.parsed.amount < 0; // Only expenses (negative amounts)
        })
        .map((tx, i) => ({
          id: `exp-${batchId}-${i}`,
          budgetId,
          categoryId: (tx.userCategoryId ??
            tx.categorization.categoryId) as string,
          description: tx.parsed.description,
          amount: Math.abs(tx.parsed.amount),
          previousAmount: 0,
          paymentSource: "debito" as const,
          status: "paid" as const,
          paidDate: tx.parsed.date,
          isRecurring: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

      if (expenses.length > 0) {
        await db.expenses.bulkAdd(expenses);
      }

      // Create user rules for transactions marked with "remember"
      const toRemember = categorized.filter(
        (tx) =>
          tx.remember && (tx.userCategoryId ?? tx.categorization.categoryId),
      );
      for (const tx of toRemember) {
        const catId = tx.userCategoryId ?? tx.categorization.categoryId;
        if (catId) {
          const pattern = suggestPattern(tx.parsed.description);
          await createUserRule(pattern, catId);
        }
      }

      setImportResult({ count: toImport.length, month });
      setStep("confirm");
    } catch (err) {
      setError(
        `Error al importar: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsProcessing(false);
    }
  }

  // CSV import (legacy)
  async function handleCsvImport() {
    setIsProcessing(true);
    const batchId = `import-${Date.now()}`;

    const transactions: BankTransaction[] = csvRows.map((row, i) => ({
      id: `tx-${batchId}-${i}`,
      importBatch: batchId,
      transactionDate: parseDateStr(row.fecha),
      description: row.descripcion,
      reference: row.referencia,
      amount: row.valor,
      office: row.oficina,
      status: "pending" as const,
      importedAt: new Date(),
    }));

    await db.bankTransactions.bulkAdd(transactions);
    setCsvRows([]);
    setImportResult({
      count: transactions.length,
      month: toMonthKey(new Date()),
    });
    setStep("confirm");
    setIsProcessing(false);
  }

  // ─── Reset ─────────────────────────────────────────────────────────

  function handleReset() {
    setStep("upload");
    setError(null);
    setFileName("");
    setStatement(null);
    setCategorized([]);
    setCsvRows([]);
    setImportResult(null);
  }

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-20 md:pb-6 md:pl-56">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Importar Extracto Bancario</h2>
        {step !== "upload" && step !== "confirm" && (
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <X className="h-4 w-4 mr-1" /> Cancelar
          </Button>
        )}
      </div>

      {/* Step indicator */}
      <StepIndicator current={step} />

      {/* Step 1: Upload */}
      {step === "upload" && (
        <UploadStep
          isDragging={isDragging}
          isProcessing={isProcessing}
          error={error}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onFileInput={handleFileInput}
        />
      )}

      {/* Step 2: Review (PDF) */}
      {step === "review" && statement && categorized.length > 0 && (
        <ReviewStep
          statement={statement}
          categorized={categorized}
          categories={categories ?? []}
          isProcessing={isProcessing}
          onUpdateTransaction={updateTransaction}
          onImport={handleImport}
          onBack={handleReset}
        />
      )}

      {/* Step 2: Review (CSV fallback) */}
      {step === "review" && csvRows.length > 0 && (
        <CsvReviewStep
          rows={csvRows}
          fileName={fileName}
          isProcessing={isProcessing}
          onImport={handleCsvImport}
          onBack={handleReset}
        />
      )}

      {/* Step 3: Confirmation */}
      {step === "confirm" && importResult && (
        <ConfirmStep result={importResult} onReset={handleReset} />
      )}

      {error && step !== "upload" && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function StepIndicator({ current }: { current: ImportStep }) {
  const steps: { key: ImportStep; label: string }[] = [
    { key: "upload", label: "Subir" },
    { key: "review", label: "Revisar" },
    { key: "confirm", label: "Listo" },
  ];

  return (
    <div className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
              current === s.key
                ? "bg-primary text-primary-foreground"
                : steps.findIndex((x) => x.key === current) > i
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {i + 1}
          </span>
          <span
            className={cn(
              current === s.key ? "font-medium" : "text-muted-foreground",
            )}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      ))}
    </div>
  );
}

function UploadStep({
  isDragging,
  isProcessing,
  error,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileInput,
}: {
  isDragging: boolean;
  isProcessing: boolean;
  error: string | null;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <>
      <Card
        className={cn(
          "border-2 border-dashed transition-colors cursor-pointer",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted hover:border-primary/50",
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <CardContent className="flex flex-col items-center justify-center py-12">
          {isProcessing ? (
            <>
              <Loader2 className="h-10 w-10 text-primary mb-3 animate-spin" />
              <p className="text-sm font-medium">Procesando PDF...</p>
            </>
          ) : (
            <>
              <FileUp className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">
                Arrastra tu extracto bancario aquí
              </p>
              <p className="text-xs text-muted-foreground mt-1 text-center">
                Soporta <strong>PDF de Davibank/Davivienda</strong> y CSV/TSV de
                Bancolombia
              </p>
              <label className="mt-4 cursor-pointer">
                <input
                  type="file"
                  accept=".pdf,.csv,.tsv,.txt"
                  className="hidden"
                  onChange={onFileInput}
                  multiple
                />
                <span className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent transition-colors">
                  <Upload className="h-4 w-4" /> Seleccionar archivo
                </span>
              </label>
            </>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function ReviewStep({
  statement,
  categorized,
  categories,
  isProcessing,
  onUpdateTransaction,
  onImport,
  onBack,
}: {
  statement: ParsedStatement;
  categorized: CategorizedTransaction[];
  categories: Category[];
  isProcessing: boolean;
  onUpdateTransaction: (
    index: number,
    updates: Partial<CategorizedTransaction>,
  ) => void;
  onImport: () => void;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState<
    "all" | "auto" | "needs-review" | "transfers"
  >("all");

  const stats = useMemo(() => {
    const auto = categorized.filter(
      (tx) =>
        tx.categorization.categoryId &&
        !tx.categorization.isTransfer &&
        !tx.categorization.isBankFee,
    );
    const needsReview = categorized.filter(
      (tx) =>
        !tx.categorization.categoryId &&
        !tx.categorization.isTransfer &&
        !tx.categorization.isBankFee,
    );
    const transfers = categorized.filter(
      (tx) => tx.categorization.isTransfer || tx.categorization.isBankFee,
    );
    const toImport = categorized.filter((tx) => !tx.skip);

    return {
      auto: auto.length,
      needsReview: needsReview.length,
      transfers: transfers.length,
      toImport: toImport.length,
    };
  }, [categorized]);

  const filtered = useMemo(() => {
    return categorized
      .map((tx, index) => ({ ...tx, index }))
      .filter((tx) => {
        if (filter === "auto")
          return (
            tx.categorization.categoryId &&
            !tx.categorization.isTransfer &&
            !tx.categorization.isBankFee
          );
        if (filter === "needs-review")
          return (
            !tx.categorization.categoryId &&
            !tx.categorization.isTransfer &&
            !tx.categorization.isBankFee
          );
        if (filter === "transfers")
          return tx.categorization.isTransfer || tx.categorization.isBankFee;
        return true;
      });
  }, [categorized, filter]);

  return (
    <>
      {/* Statement info */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Extracto Davibank</span>
            <Badge variant="outline" className="text-xs">
              {statement.periodLabel}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <span>Cuenta: {statement.accountNumber}</span>
            <span>Transacciones: {statement.transactions.length}</span>
          </div>
        </CardContent>
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => setFilter("auto")}
          className={cn(
            "rounded-lg border p-3 text-center transition-colors",
            filter === "auto"
              ? "border-primary bg-primary/5"
              : "hover:bg-muted/50",
          )}
        >
          <div className="flex items-center justify-center gap-1 text-positive">
            <Sparkles className="h-3 w-3" />
            <span className="text-lg font-bold">{stats.auto}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Auto-categorizadas
          </p>
        </button>
        <button
          onClick={() => setFilter("needs-review")}
          className={cn(
            "rounded-lg border p-3 text-center transition-colors",
            filter === "needs-review"
              ? "border-primary bg-primary/5"
              : "hover:bg-muted/50",
          )}
        >
          <div className="flex items-center justify-center gap-1 text-amber-500">
            <HelpCircle className="h-3 w-3" />
            <span className="text-lg font-bold">{stats.needsReview}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Por revisar
          </p>
        </button>
        <button
          onClick={() => setFilter("transfers")}
          className={cn(
            "rounded-lg border p-3 text-center transition-colors",
            filter === "transfers"
              ? "border-primary bg-primary/5"
              : "hover:bg-muted/50",
          )}
        >
          <div className="flex items-center justify-center gap-1 text-muted-foreground">
            <Ban className="h-3 w-3" />
            <span className="text-lg font-bold">{stats.transfers}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Transferencias
          </p>
        </button>
      </div>

      {filter !== "all" && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => setFilter("all")}
        >
          ← Ver todas
        </Button>
      )}

      {/* Transaction list */}
      <div className="space-y-2 max-h-[50vh] overflow-y-auto">
        {filtered.map((tx) => (
          <TransactionCard
            key={tx.index}
            tx={tx}
            categories={categories}
            onUpdate={(updates) => onUpdateTransaction(tx.index, updates)}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
        <Button
          onClick={onImport}
          disabled={isProcessing || stats.toImport === 0}
          className="flex-1"
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-1" />
          )}
          Importar {stats.toImport}
        </Button>
      </div>
    </>
  );
}

function TransactionCard({
  tx,
  categories,
  onUpdate,
}: {
  tx: CategorizedTransaction & { index: number };
  categories: Category[];
  onUpdate: (updates: Partial<CategorizedTransaction>) => void;
}) {
  const isTransfer = tx.categorization.isTransfer;
  const isBankFee = tx.categorization.isBankFee;
  const isSkipped = tx.skip;
  const effectiveCategoryId = tx.userCategoryId ?? tx.categorization.categoryId;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2 transition-opacity",
        isSkipped && "opacity-50",
        isTransfer && "border-dashed bg-muted/30",
        isBankFee && "border-dashed bg-muted/30",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-medium truncate",
              isTransfer && "italic text-muted-foreground",
            )}
          >
            {tx.parsed.description}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-muted-foreground">
              {tx.parsed.date.toLocaleDateString("es-CO")}
            </span>
            {isTransfer && (
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                Transferencia
              </Badge>
            )}
            {isBankFee && (
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                Cargo bancario
              </Badge>
            )}
            {!isTransfer &&
              !isBankFee &&
              tx.categorization.confidence !== "none" && (
                <Badge
                  variant={
                    tx.categorization.confidence === "high"
                      ? "success"
                      : "warning"
                  }
                  className="text-[10px] px-1 py-0"
                >
                  {tx.categorization.confidence === "high"
                    ? "✓ Auto"
                    : "~ Sugerida"}
                </Badge>
              )}
          </div>
        </div>
        <span
          className={cn(
            "text-sm font-semibold tabular-nums shrink-0",
            tx.parsed.amount < 0 ? "text-negative" : "text-positive",
          )}
        >
          {formatCOP(tx.parsed.amount)}
        </span>
      </div>

      {/* Category selection + skip control */}
      <div className="flex items-center gap-2">
        <select
          value={effectiveCategoryId ?? ""}
          onChange={(e) =>
            onUpdate({ userCategoryId: e.target.value || undefined })
          }
          className="flex-1 h-7 rounded border border-input bg-background px-2 text-xs"
          disabled={isSkipped}
        >
          <option value="">Sin categoría</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.icon} {cat.name}
            </option>
          ))}
        </select>

        {/* Remember checkbox (only for manually categorized) */}
        {(tx.userCategoryId ||
          (!isTransfer &&
            !isBankFee &&
            tx.categorization.confidence === "none")) &&
          effectiveCategoryId && (
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap cursor-pointer">
              <input
                type="checkbox"
                checked={tx.remember}
                onChange={(e) => onUpdate({ remember: e.target.checked })}
                className="h-3 w-3 rounded border-input"
              />
              Recordar
            </label>
          )}

        {/* Skip toggle */}
        <button
          onClick={() => onUpdate({ skip: !isSkipped })}
          className={cn(
            "h-7 w-7 flex items-center justify-center rounded border transition-colors shrink-0",
            isSkipped
              ? "bg-muted border-muted-foreground/30 text-muted-foreground"
              : "border-input hover:bg-muted text-muted-foreground",
          )}
          title={isSkipped ? "Incluir en importación" : "Omitir"}
        >
          {isSkipped ? <X className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

function CsvReviewStep({
  rows,
  fileName,
  isProcessing,
  onImport,
  onBack,
}: {
  rows: CsvParsedRow[];
  fileName: string;
  isProcessing: boolean;
  onImport: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {fileName} — {rows.length} transacciones
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="max-h-64 overflow-y-auto space-y-1">
            {rows.slice(0, 20).map((row, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded border p-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{row.descripcion}</p>
                  <p className="text-xs text-muted-foreground">{row.fecha}</p>
                </div>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    row.valor < 0 ? "text-negative" : "text-positive",
                  )}
                >
                  {formatCOP(row.valor)}
                </span>
              </div>
            ))}
            {rows.length > 20 && (
              <p className="text-center text-xs text-muted-foreground">
                ... y {rows.length - 20} más
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
        <Button className="flex-1" onClick={onImport} disabled={isProcessing}>
          {isProcessing ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-1" />
          )}
          Importar {rows.length}
        </Button>
      </div>
    </>
  );
}

function ConfirmStep({
  result,
  onReset,
}: {
  result: { count: number; month: string };
  onReset: () => void;
}) {
  return (
    <Card className="border-positive">
      <CardContent className="p-6 text-center space-y-3">
        <div className="flex justify-center">
          <div className="h-12 w-12 rounded-full bg-positive/10 flex items-center justify-center">
            <Check className="h-6 w-6 text-positive" />
          </div>
        </div>
        <div>
          <p className="font-medium">¡Importación completada!</p>
          <p className="text-sm text-muted-foreground mt-1">
            Se importaron <strong>{result.count}</strong> transacciones al mes{" "}
            <strong>{result.month}</strong>
          </p>
        </div>
        <Button onClick={onReset} variant="outline" className="mt-4">
          Importar otro extracto
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

interface CsvParsedRow {
  fecha: string;
  documento: string;
  oficina: string;
  descripcion: string;
  referencia: string;
  valor: number;
}

function parseDateStr(dateStr: string): Date {
  if (/^\d{4}[/-]\d{2}[/-]\d{2}$/.test(dateStr)) {
    return new Date(dateStr.replace(/\//g, "-"));
  }
  if (/^\d{1,2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [d, m, y] = dateStr.split("/");
    return new Date(`${y}-${m}-${d}`);
  }
  return new Date(dateStr);
}
