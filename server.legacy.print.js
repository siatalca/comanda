const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const PORT = Number(process.env.PRINT_PORT || 3003);
const HOST = process.env.PRINT_HOST || "0.0.0.0";
const APP_TIMEZONE = resolveTimezone(process.env.APP_TIMEZONE || "America/Santiago");
const JOBS_DIR = path.join(__dirname, "print_jobs");

ensureDir(JOBS_DIR);

const server = http.createServer(async (req, res) => {
    setCors(res);
    const requestPath = String(req.url || "").split("?")[0];

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === "GET" && requestPath === "/health") {
        replyJson(res, 200, {
            ok: true,
            status: "up",
            service: "local-print-service",
            timestamp: new Date().toISOString(),
            timestamp_local: formatLocalTimestamp(new Date()),
            timezone: APP_TIMEZONE
        });
        return;
    }

    if (req.method === "GET" && requestPath === "/printers") {
        const list = await listPrinters();
        if (!list.ok) {
            replyJson(res, 500, list);
            return;
        }
        replyJson(res, 200, list);
        return;
    }

    if (req.method === "POST" && requestPath === "/print") {
        try {
            const body = await readBody(req);
            const tipo = String(body.tipo || "ticket");
            const comandaId = Number(body.comanda_id || 0);
            const impresionId = Number(body.impresion_id || 0);
            const printerName = String(body.printer_name || "").trim();
            const paperWidthMm = clampInt(body.paper_width_mm, 58, 48, 120);
            const charsPerLine = clampInt(body.chars_per_line, 32, 20, 80);
            const fontSizePt = clampFloat(body.font_size_pt, 9, 6, 16);
            const text = String(body.texto || "").trim();

            if (!text) {
                replyJson(res, 422, {
                    ok: false,
                    error: "Texto de impresion vacio."
                });
                return;
            }

            const filename = buildFilename(tipo, comandaId, impresionId);
            const filePath = path.join(JOBS_DIR, filename);
            fs.writeFileSync(filePath, text + "\n", "utf8");

            const printStatus = await printTextFile(filePath, printerName, {
                paperWidthMm,
                charsPerLine,
                fontSizePt
            });
            if (!printStatus.ok) {
                replyJson(res, 500, {
                    ok: false,
                    error: printStatus.error,
                    printer: printStatus.printer || "",
                    paperWidthMm,
                    charsPerLine,
                    fontSizePt,
                    file: filename
                });
                return;
            }

            replyJson(res, 200, {
                ok: true,
                message: "Ticket enviado a impresora local.",
                printer: printStatus.printer || "",
                paperWidthMm,
                charsPerLine,
                fontSizePt,
                mode: printStatus.mode || "custom",
                warning: printStatus.warning || "",
                file: filename
            });
            return;
        } catch (error) {
            replyJson(res, 500, {
                ok: false,
                error: error.message || "Fallo inesperado en impresion."
            });
            return;
        }
    }

    replyJson(res, 404, {
        ok: false,
        error: "Ruta no encontrada."
    });
});

server.listen(PORT, HOST, () => {
    console.log(`Print service activo en http://${HOST}:${PORT}`);
});

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function setCors(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function replyJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8"
    });
    res.end(JSON.stringify(payload));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = "";
        req.on("data", (chunk) => {
            raw += chunk.toString("utf8");
            if (raw.length > 1024 * 1024) {
                reject(new Error("Payload demasiado grande."));
            }
        });
        req.on("end", () => {
            if (!raw.trim()) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch {
                reject(new Error("JSON invalido."));
            }
        });
        req.on("error", (error) => reject(error));
    });
}

function buildFilename(tipo, comandaId, impresionId) {
    const safeType = String(tipo || "ticket").replace(/[^a-z0-9_-]/gi, "_");
    const stamp = formatLocalStamp(new Date());
    return `${stamp}_${safeType}_comanda-${comandaId || "na"}_job-${impresionId || "na"}.txt`;
}

function resolveTimezone(rawTz) {
    const fallback = "America/Santiago";
    const tz = String(rawTz || "").trim() || fallback;
    try {
        new Intl.DateTimeFormat("es-CL", { timeZone: tz }).format(new Date());
        return tz;
    } catch {
        return fallback;
    }
}

function formatLocalTimestamp(dateObj) {
    const parts = getLocalDateParts(dateObj);
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function formatLocalStamp(dateObj) {
    const parts = getLocalDateParts(dateObj);
    return `${parts.year}${parts.month}${parts.day}_${parts.hour}${parts.minute}${parts.second}`;
}

function getLocalDateParts(dateObj) {
    const date = dateObj instanceof Date ? dateObj : new Date();

    try {
        const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: APP_TIMEZONE,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        });
        const rawParts = formatter.formatToParts(date);
        const partsByType = {};
        rawParts.forEach((part) => {
            partsByType[part.type] = part.value;
        });

        return {
            year: partsByType.year || String(date.getFullYear()),
            month: partsByType.month || String(date.getMonth() + 1).padStart(2, "0"),
            day: partsByType.day || String(date.getDate()).padStart(2, "0"),
            hour: normalizeHour(partsByType.hour || String(date.getHours()).padStart(2, "0")),
            minute: partsByType.minute || String(date.getMinutes()).padStart(2, "0"),
            second: partsByType.second || String(date.getSeconds()).padStart(2, "0")
        };
    } catch {
        return {
            year: String(date.getFullYear()),
            month: String(date.getMonth() + 1).padStart(2, "0"),
            day: String(date.getDate()).padStart(2, "0"),
            hour: normalizeHour(String(date.getHours()).padStart(2, "0")),
            minute: String(date.getMinutes()).padStart(2, "0"),
            second: String(date.getSeconds()).padStart(2, "0")
        };
    }
}

function normalizeHour(value) {
    const raw = String(value || "00").padStart(2, "0");
    if (raw === "24") {
        return "00";
    }
    return raw;
}

function psEscape(value) {
    return String(value).replace(/'/g, "''");
}

async function printTextFile(filePath, explicitPrinter = "", options = {}) {
    if (process.platform !== "win32") {
        return {
            ok: false,
            error: "Impresion automatica disponible solo en Windows.",
            printer: String(explicitPrinter || "")
        };
    }

    const selectedPrinter = String(explicitPrinter || "").trim();
    const envPrinter = process.env.PRINTER_NAME ? String(process.env.PRINTER_NAME) : "";
    const printerName = selectedPrinter || envPrinter;
    const paperWidthMm = clampInt(options.paperWidthMm, 58, 48, 120);
    const fontSizePt = clampFloat(options.fontSizePt, 9, 6, 16);

    const customStatus = await printWithCustomPaper(filePath, printerName, paperWidthMm, fontSizePt);
    if (customStatus.ok) {
        return {
            ok: true,
            info: customStatus.info,
            printer: customStatus.printer,
            mode: "custom"
        };
    }

    const fallbackStatus = await printWithOutPrinter(filePath, printerName);
    if (fallbackStatus.ok) {
        return {
            ok: true,
            info: fallbackStatus.info,
            printer: fallbackStatus.printer,
            mode: "fallback_out_printer",
            warning: `Formato termico no aplicado. Fallback Out-Printer. Motivo: ${customStatus.error}`
        };
    }

    return {
        ok: false,
        error: `No se pudo imprimir. Custom: ${customStatus.error}. Fallback: ${fallbackStatus.error}`,
        printer: printerName
    };
}

function printWithCustomPaper(filePath, printerName, paperWidthMm, fontSizePt) {
    const escapedPath = psEscape(filePath);
    const escapedPrinter = psEscape(printerName || "");
    const command = [
        "$ErrorActionPreference='Stop'",
        "Add-Type -AssemblyName System.Drawing",
        `$filePath='${escapedPath}'`,
        `$printerName='${escapedPrinter}'`,
        `$paperWidthMm=${paperWidthMm}`,
        `$fontSizePt=${fontSizePt}`,
        "$ticketLines = Get-Content -LiteralPath $filePath",
        "if ($null -eq $ticketLines) { $ticketLines = @('') }",
        "$ticketFont = New-Object System.Drawing.Font('Consolas', $fontSizePt)",
        "$lineHeight = [int][Math]::Ceiling($ticketFont.GetHeight())",
        "$doc = New-Object System.Drawing.Printing.PrintDocument",
        "if ($printerName -ne '') { $doc.PrinterSettings.PrinterName = $printerName }",
        "if (-not $doc.PrinterSettings.IsValid) { throw 'Impresora no valida o no instalada.' }",
        "$paperWidth = [int][Math]::Round(($paperWidthMm / 25.4) * 100)",
        "$paperHeight = [int][Math]::Max(400, (($ticketLines.Count + 8) * $lineHeight))",
        "$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(5,5,5,5)",
        "$doc.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('TicketCustom',$paperWidth,$paperHeight)",
        "$script:lineIndex = 0",
        "$script:ticketLines = $ticketLines",
        "$script:ticketFont = $ticketFont",
        "$script:ticketLineHeight = [int][Math]::Max(10, $lineHeight)",
        "$doc.add_PrintPage({",
        "$e = $args[1]",
        "$y = $e.MarginBounds.Top",
        "while($script:lineIndex -lt $script:ticketLines.Count){",
        "$line = [string]$script:ticketLines[$script:lineIndex]",
        "$e.Graphics.DrawString($line,$script:ticketFont,[System.Drawing.Brushes]::Black,$e.MarginBounds.Left,$y)",
        "$y += $script:ticketLineHeight",
        "$script:lineIndex++",
        "if(($y + $script:ticketLineHeight) -gt $e.MarginBounds.Bottom){",
        "$e.HasMorePages = $true",
        "return",
        "}",
        "}",
        "$e.HasMorePages = $false",
        "})",
        "$doc.Print()",
        "$doc.Dispose()",
        "$ticketFont.Dispose()"
    ].join("; ");

    return execPowerShell(command, 22000).then((result) => {
        if (!result.ok) {
            return {
                ok: false,
                error: `No se pudo imprimir en modo termico: ${result.error}`,
                printer: printerName
            };
        }

        return {
            ok: true,
            info: result.stdout || "",
            printer: printerName
        };
    });
}

function printWithOutPrinter(filePath, printerName) {
    const escapedPath = psEscape(filePath);
    let command = `Get-Content -LiteralPath '${escapedPath}' | Out-Printer`;
    if (printerName) {
        command = `Get-Content -LiteralPath '${escapedPath}' | Out-Printer -Name '${psEscape(printerName)}'`;
    }

    return execPowerShell(command, 15000).then((result) => {
        if (!result.ok) {
            return {
                ok: false,
                error: `No se pudo imprimir con Out-Printer: ${result.error}`,
                printer: printerName
            };
        }

        return {
            ok: true,
            info: result.stdout || "",
            printer: printerName
        };
    });
}

function execPowerShell(command, timeoutMs) {
    return new Promise((resolve) => {
        execFile(
            "powershell.exe",
            ["-NoProfile", "-Command", command],
            { windowsHide: true, timeout: timeoutMs || 15000 },
            (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        ok: false,
                        error: String(stderr || error.message || "Error PowerShell")
                    });
                    return;
                }
                resolve({
                    ok: true,
                    stdout: String(stdout || "")
                });
            }
        );
    });
}

function clampInt(value, fallback, min, max) {
    const num = Number.parseInt(value, 10);
    if (!Number.isFinite(num)) {
        return fallback;
    }
    if (num < min) {
        return min;
    }
    if (num > max) {
        return max;
    }
    return num;
}

function clampFloat(value, fallback, min, max) {
    const num = Number.parseFloat(value);
    if (!Number.isFinite(num)) {
        return fallback;
    }
    if (num < min) {
        return min;
    }
    if (num > max) {
        return max;
    }
    return Math.round(num * 10) / 10;
}

function listPrinters() {
    return new Promise((resolve) => {
        if (process.platform !== "win32") {
            resolve({
                ok: false,
                error: "Listado de impresoras disponible solo en Windows."
            });
            return;
        }

        const command = [
            "$ErrorActionPreference='Stop'",
            "try {",
            "  $printers = Get-Printer | Select-Object -ExpandProperty Name",
            "} catch {",
            "  $printers = Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name",
            "}",
            "if ($null -eq $printers) { $printers = @() }",
            "try {",
            "  $def = Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1 -ExpandProperty Name",
            "} catch {",
            "  $def = ''",
            "}",
            "$result = [PSCustomObject]@{ ok = $true; printers = @($printers); defaultPrinter = $def }",
            "$result | ConvertTo-Json -Compress"
        ].join("; ");

        execFile(
            "powershell.exe",
            ["-NoProfile", "-Command", command],
            { windowsHide: true, timeout: 15000 },
            (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        ok: false,
                        error: `No se pudo listar impresoras: ${stderr || error.message}`
                    });
                    return;
                }

                try {
                    const parsed = JSON.parse(stdout || "{}");
                    const printers = Array.isArray(parsed.printers)
                        ? parsed.printers
                        : parsed.printers
                            ? [parsed.printers]
                            : [];

                    resolve({
                        ok: true,
                        printers,
                        defaultPrinter: parsed.defaultPrinter || ""
                    });
                } catch {
                    resolve({
                        ok: false,
                        error: "No se pudo interpretar el listado de impresoras."
                    });
                }
            }
        );
    });
}
