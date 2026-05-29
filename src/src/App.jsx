import { useState, useRef } from "react";

const SYSTEM_PROMPT = `You are a receipt splitting assistant. Every time I upload a receipt photo, immediately output a complete interactive HTML page with no questions asked.

PARSE the receipt and extract: restaurant name, date, all line items (name, unit price, quantity), subtotal, tax/SST, service charge, rounding difference, grand total. Also extract who to pay from my message (e.g. "split this, pay Friend B" → collector = Friend B).

THEN generate a complete standalone interactive HTML page (starting with <!DOCTYPE html>) using this exact design:

LAYOUT
- Header row: restaurant name (15px/600 weight) on the left, date + grand total + "SST incl." (11px muted) on the right, space-between
- Pay banner: one line below the header reading "💸 Pay to: [Collector]" in a purple pill (bg #EEEDFE, text #3C3489, 12px/500, inline-block, border-radius 6px, padding 5px 10px). Only show if a collector is named.
- People row: coloured chips with the name visible in full, plus × button to remove, and a Name input + "+ Add" button at the end
- Small hint below chips: "Tap a name to edit it"
- A horizontal TABLE where:
  - Column 1: Item name (left-aligned, 12px/500), with ×N badge in 10px muted if qty > 1
  - Column 2: Item total price (center, 11px muted)
  - Column 3: A small "÷ Split" button — when clicked, distributes this item equally among ALL current people using fractional portions (e.g. 1 item ÷ 3 people = 0.333 each). Steppers support decimal values for this.
  - One column per person: header = first name in their colour; cell = stepper only
- Steppers highlight in the person's colour when qty > 0
- Steppers enforce max qty — total assigned across all people cannot exceed item qty. Steppers support decimal values for equal splits.
- Totals cards below table: one coloured card per person (flex-wrap) showing name, Food line, SST line, Extra Charges line (if any), divider, bold total, and italic "→ Pay [Collector]" line (or "(you collected)" for the collector). Only show pay line if a collector is named.
- Status note below cards: red ⚠ with unassigned amount if not fully split; green ✓ when totals sum to grand total
- Two buttons: "Copy for WhatsApp" and "Reset"

EDITABLE NAMES — use contenteditable span, NOT input
On blur: update people[pi], re-render thead and totals only (not chips).

COLOURS — assign in order, cycling if more than 6
Person 0 (teal):   chip bg #E1F5EE text #085041 | stepper lit border #5DCAA5 bg #D4F0E5 | card bg #E1F5EE name #085041 amount #0F6E56
Person 1 (purple): chip bg #EEEDFE text #3C3489 | stepper lit border #AFA9EC bg #E0DFFB | card bg #EEEDFE name #3C3489 amount #534AB7
Person 2 (pink):   chip bg #FBEAF0 text #72243E | stepper lit border #ED93B1 bg #F8D9E7 | card bg #FBEAF0 name #72243E amount #993556
Person 3 (amber):  chip bg #FAEEDA text #633806 | stepper lit border #EF9F27 bg #F5E0B5 | card bg #FAEEDA name #633806 amount #854F0B
Person 4 (blue):   chip bg #E6F1FB text #0C447C | stepper lit border #85B7EB bg #D3E7F8 | card bg #E6F1FB name #0C447C amount #185FA5
Person 5 (coral):  chip bg #FAECE7 text #712B13 | stepper lit border #F0997B bg #F7D9CE | card bg #FAECE7 name #712B13 amount #993C1D

MATHS — follow this exactly
const billSubtotal = items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
const scale = grandTotal / billSubtotal;
function foodOf(pi)  { return items.reduce((s, it, i) => s + assigned[i][pi] * it.unitPrice, 0); }
function sstOf(pi)   { return foodOf(pi) * sstAmount / billSubtotal; }
function totalOf(pi) { return foodOf(pi) * scale; }

EXTRA CHARGES — split equally
Service charge and rounding split equally. Show in each card: Food, SST (if >0), Service charge (if >0), Rounding (if non-zero), then Total, then → Pay line.

BEHAVIOUR
- Default people: You, Friend A, Friend B, Friend C
- Status note: Red ⚠ if unassigned, Green ✓ if all assigned
- "Copy for WhatsApp" format:
🧾 [Restaurant] – [Date]
━━━━━━━━━━━━━━━
[Name]: RM [total] (food RM [food] + SST RM [sst]...) → Pay [Collector]
[Collector]: RM [total] (...) (you collected)
━━━━━━━━━━━━━━━
Total: RM [grandTotal]

RULES
- Output a COMPLETE standalone HTML page starting with <!DOCTYPE html> — no markdown, no explanation
- No gradients, no shadows, flat clean design
- Table: items as rows, people as columns, wrapped in overflow-x: auto
- Never hardcode the subtotal — always recalculate from items array`;

const features = [
  { icon: "📷", title: "Snap & Upload", desc: "Photo of any receipt — we'll read it for you" },
  { icon: "👥", title: "Assign Items", desc: "Drag portions to each person, or split equally" },
  { icon: "💬", title: "Share Instantly", desc: "One tap copies a clean WhatsApp-ready summary" },
];

const steps = [
  { n: "1", text: "Upload your receipt photo" },
  { n: "2", text: 'Type who to pay, e.g. "pay Friend B"' },
  { n: "3", text: "Assign items using steppers or ÷ Split" },
  { n: "4", text: "Copy the summary and send to your group" },
];

export default function App() {
  const toolRef = useRef();
  const fileRef = useRef();
  const [b64, setB64] = useState(null);
  const [mime, setMime] = useState("image/jpeg");
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [html, setHtml] = useState(null);
  const [err, setErr] = useState(null);

  const scrollToTool = () => toolRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const onFile = (e) => {
    const f = e.target.files[0]; if (!f) return;
    setMime(f.type || "image/jpeg");
    setPreview(URL.createObjectURL(f));
    const r = new FileReader();
    r.onload = () => setB64(r.result.split(",")[1]);
    r.readAsDataURL(f);
    setHtml(null); setErr(null);
  };

  const onDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0]; if (!f) return;
    setMime(f.type || "image/jpeg");
    setPreview(URL.createObjectURL(f));
    const r = new FileReader();
    r.onload = () => setB64(r.result.split(",")[1]);
    r.readAsDataURL(f);
    setHtml(null); setErr(null);
  };

  const run = async () => {
    if (!b64) return;
    setLoading(true); setErr(null); setHtml(null);
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
            { type: "text", text: msg.trim() || "Split this receipt" }
          ]}]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const raw = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      setHtml(raw.replace(/^```html\s*/i, "").replace(/\s*```$/, "").trim());
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const reset = () => { setHtml(null); setB64(null); setPreview(null); setMsg(""); setErr(null); };

  const S = {
    root: { fontFamily: "'Inter', system-ui, sans-serif", color: "#1A1A1A", background: "#fff" },
    nav: { position: "sticky", top: 0, zIndex: 100, background: "rgba(255,255,255,0.92)", backdropFilter: "blur(10px)", borderBottom: "1px solid #EBEBEB", padding: "13px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" },
    hero: { padding: "64px 28px 56px", textAlign: "center", maxWidth: 580, margin: "0 auto" },
    badge: { display: "inline-block", background: "#EEEDFE", color: "#3C3489", borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 600, marginBottom: 20, letterSpacing: "0.04em" },
    h1: { fontSize: 38, fontWeight: 750, letterSpacing: "-0.03em", lineHeight: 1.15, margin: "0 0 16px" },
    sub: { fontSize: 15, color: "#666", lineHeight: 1.65, margin: "0 0 32px" },
    ctaRow: { display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" },
    cta: { background: "#3C3489", color: "#fff", border: "none", borderRadius: 10, padding: "12px 26px", fontSize: 14, fontWeight: 650, cursor: "pointer" },
    ghost: { background: "#fff", color: "#3C3489", border: "1.5px solid #C8C5F5", borderRadius: 10, padding: "12px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
    features: { padding: "0 24px 60px", maxWidth: 620, margin: "0 auto" },
    grid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 },
    fCard: { background: "#FAFAFA", border: "1px solid #EBEBEB", borderRadius: 14, padding: "20px 16px", textAlign: "center" },
    howSection: { background: "#FAFAFA", borderTop: "1px solid #EBEBEB", borderBottom: "1px solid #EBEBEB", padding: "48px 28px" },
    howInner: { maxWidth: 520, margin: "0 auto" },
    overline: { fontSize: 11, fontWeight: 700, color: "#999", letterSpacing: "0.07em", textAlign: "center", marginBottom: 6 },
    h2: { fontSize: 22, fontWeight: 700, textAlign: "center", letterSpacing: "-0.02em", margin: "0 0 32px" },
    stepRow: { display: "flex", alignItems: "center", gap: 14 },
    stepNum: { width: 30, height: 30, borderRadius: "50%", background: "#EEEDFE", color: "#3C3489", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 },
    toolSection: { padding: "52px 24px 72px", maxWidth: 620, margin: "0 auto" },
    card: { background: "#fff", border: "1px solid #EBEBEB", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 16 },
    dropzone: { border: "1.5px dashed #D8D8D8", borderRadius: 12, minHeight: 180, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", background: "#FAFAFA" },
    inp: { border: "1px solid #E4E4E4", borderRadius: 9, padding: "9px 12px", fontSize: 13, outline: "none", width: "100%", color: "#333" },
    footer: { borderTop: "1px solid #EBEBEB", padding: "22px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  };

  return (
    <div style={S.root}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box} button:focus{outline:none}`}</style>

      <nav style={S.nav}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>🧾 Receipt Splitter</span>
        <button style={S.cta} onClick={scrollToTool}>Split a Receipt →</button>
      </nav>

      <section style={S.hero}>
        <div style={S.badge}>POWERED BY AI</div>
        <h1 style={S.h1}>Split bills.<br />Zero awkwardness.</h1>
        <p style={S.sub}>Snap a receipt, assign items to each person, and get a WhatsApp-ready summary in seconds. No more mental maths at the table.</p>
        <div style={S.ctaRow}>
          <button style={S.cta} onClick={scrollToTool}>Split a Receipt →</button>
          <button style={S.ghost} onClick={scrollToTool}>See how it works</button>
        </div>
      </section>

      <section style={S.features}>
        <div style={S.grid}>
          {features.map((f, i) => (
            <div key={i} style={S.fCard}>
              <div style={{ fontSize: 26, marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 650, marginBottom: 5 }}>{f.title}</div>
              <div style={{ fontSize: 11.5, color: "#888", lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={S.howSection}>
        <div style={S.howInner}>
          <div style={S.overline}>HOW IT WORKS</div>
          <h2 style={S.h2}>Done in four steps</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {steps.map((s, i) => (
              <div key={i} style={S.stepRow}>
                <div style={S.stepNum}>{s.n}</div>
                <div style={{ fontSize: 13.5, color: "#333" }}>{s.text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section ref={toolRef} style={S.toolSection}>
        <div style={S.overline}>THE TOOL</div>
        <h2 style={S.h2}>Upload your receipt</h2>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#888" }}>
            <div style={{ width: 30, height: 30, border: "3px solid #E0DFFB", borderTop: "3px solid #3C3489", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 16px" }} />
            <div style={{ fontSize: 13 }}>Analysing receipt…</div>
          </div>
        ) : html ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button onClick={reset} style={{ background: "none", border: "none", color: "#3C3489", fontSize: 12, fontWeight: 600, padding: 0, cursor: "pointer" }}>← Split another receipt</button>
              <span style={{ background: "#E1F5EE", color: "#085041", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>✓ Done</span>
            </div>
            <iframe srcDoc={html} style={{ width: "100%", height: "80vh", border: "1px solid #E8E8E8", borderRadius: 14, background: "#fff" }} title="Receipt Split" sandbox="allow-scripts" />
          </div>
        ) : (
          <div style={S.card}>
            <div style={S.dropzone} onClick={() => fileRef.current.click()} onDrop={onDrop} onDragOver={e => e.preventDefault()}>
              {preview
                ? <img src={preview} style={{ width: "100%", maxHeight: 280, objectFit: "contain" }} alt="receipt" />
                : <div style={{ textAlign: "center", padding: 28 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#444" }}>Click or drag & drop receipt</div>
                    <div style={{ fontSize: 11, color: "#AAA", marginTop: 4 }}>JPG · PNG · HEIC supported</div>
                  </div>
              }
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFile} />
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#999", letterSpacing: "0.06em", marginBottom: 6 }}>WHO TO PAY? (OPTIONAL)</div>
              <input style={S.inp} placeholder='e.g. "Split this, pay Friend B"' value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && b64 && run()} />
            </div>
            <button onClick={run} disabled={!b64} style={{ background: b64 ? "#3C3489" : "#C5C3E8", color: "#fff", border: "none", borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 650, cursor: b64 ? "pointer" : "not-allowed" }}>
              {b64 ? "✨ Split Receipt" : "Upload a receipt to begin"}
            </button>
            {err && <div style={{ color: "#C0392B", fontSize: 12, background: "#FDF0EE", padding: "9px 12px", borderRadius: 8 }}>⚠ {err}</div>}
          </div>
        )}
      </section>

      <footer style={S.footer}>
        <span style={{ fontSize: 13, fontWeight: 650 }}>🧾 Receipt Splitter</span>
        <span style={{ fontSize: 11, color: "#BBB" }}>Built with Claude · No data stored</span>
      </footer>
    </div>
  );
}
