import dotenv from "dotenv";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";

dotenv.config();

// 10 quality/price tiers
const TIERS = [
  { tier: "Economy",   mult: 0.55, rating: 3.6 },
  { tier: "Basic",     mult: 0.7,  rating: 3.8 },
  { tier: "Standard",  mult: 0.85, rating: 4.0 },
  { tier: "Standard+", mult: 1.0,  rating: 4.1 },
  { tier: "Advanced",  mult: 1.2,  rating: 4.2 },
  { tier: "Premium",   mult: 1.45, rating: 4.4 },
  { tier: "Premium+",  mult: 1.7,  rating: 4.5 },
  { tier: "Pro",       mult: 2.0,  rating: 4.6 },
  { tier: "Pro Max",   mult: 2.4,  rating: 4.8 },
  { tier: "Elite",     mult: 2.9,  rating: 4.9 },
];

// Per-tier spec tables for each category
// Each array index maps to the TIERS index (0-9)
const SPECS = {

  "Electronics": [
    // 0 Economy
    { "Driver Size": "20mm Standard", "Battery Life": "8 Hours", "Noise Cancelling": "None", "Connectivity": "Bluetooth 4.0", "Frequency Response": "20Hz–18kHz", "Microphone": "Basic Mono", "Weight": "310g", "Foldable": "No", "Warranty": "3 Months", "Reviews": "2,100+ buyers" },
    // 1 Basic
    { "Driver Size": "25mm", "Battery Life": "12 Hours", "Noise Cancelling": "Passive Isolation", "Connectivity": "Bluetooth 4.2", "Frequency Response": "20Hz–20kHz", "Microphone": "Mono Inline", "Weight": "290g", "Foldable": "No", "Warranty": "6 Months", "Reviews": "5,400+ buyers" },
    // 2 Standard
    { "Driver Size": "30mm", "Battery Life": "18 Hours", "Noise Cancelling": "Passive Isolation", "Connectivity": "Bluetooth 4.2", "Frequency Response": "20Hz–20kHz", "Microphone": "Stereo Inline", "Weight": "275g", "Foldable": "Yes", "Warranty": "6 Months", "Reviews": "11,200+ buyers" },
    // 3 Standard+
    { "Driver Size": "32mm", "Battery Life": "20 Hours", "Noise Cancelling": "Passive+ (soft cup)", "Connectivity": "Bluetooth 5.0", "Frequency Response": "18Hz–20kHz", "Microphone": "Dual Mic", "Weight": "265g", "Foldable": "Yes", "Warranty": "1 Year", "Reviews": "18,700+ buyers" },
    // 4 Advanced
    { "Driver Size": "35mm", "Battery Life": "25 Hours", "Noise Cancelling": "Hybrid ANC Basic", "Connectivity": "Bluetooth 5.0 + AAC", "Frequency Response": "16Hz–22kHz", "Microphone": "Dual Beamforming", "Weight": "255g", "Foldable": "Yes", "Warranty": "1 Year", "Reviews": "29,500+ buyers" },
    // 5 Premium
    { "Driver Size": "38mm", "Battery Life": "30 Hours", "Noise Cancelling": "Active ANC (−28dB)", "Connectivity": "Bluetooth 5.1 + LDAC", "Frequency Response": "14Hz–22kHz", "Microphone": "Quad-Mic Array", "Weight": "245g", "Foldable": "Yes", "Warranty": "2 Years", "Reviews": "44,800+ buyers" },
    // 6 Premium+
    { "Driver Size": "40mm", "Battery Life": "35 Hours", "Noise Cancelling": "Active ANC (−32dB)", "Connectivity": "Bluetooth 5.2 + LDAC", "Frequency Response": "10Hz–25kHz", "Microphone": "6-Mic AI Noise Reduction", "Weight": "235g", "Foldable": "Yes – flat fold", "Warranty": "2 Years", "Reviews": "61,300+ buyers" },
    // 7 Pro
    { "Driver Size": "40mm Graphene", "Battery Life": "40 Hours", "Noise Cancelling": "Smart Hybrid ANC (−38dB)", "Connectivity": "Bluetooth 5.3 + Multipoint", "Frequency Response": "8Hz–30kHz", "Microphone": "8-Mic AI + Wind Reduction", "Weight": "220g", "Foldable": "Yes – flat fold + case", "Warranty": "2 Years", "Reviews": "88,400+ buyers" },
    // 8 Pro Max
    { "Driver Size": "42mm Beryllium Composite", "Battery Life": "50 Hours (70hrs passive)", "Noise Cancelling": "Adaptive ANC (−45dB) + Transparency", "Connectivity": "Bluetooth 5.3 + Multipoint + NFC", "Frequency Response": "5Hz–40kHz (Hi-Res Audio)", "Microphone": "10-Mic AI Spatial Audio Beam", "Weight": "205g", "Foldable": "Yes – flat fold + premium case", "Warranty": "3 Years", "Reviews": "1,12,000+ buyers" },
    // 9 Elite
    { "Driver Size": "45mm Planar Magnetic", "Battery Life": "60 Hours (90hrs passive)", "Noise Cancelling": "AI Adaptive ANC (−55dB) + Ambient EQ", "Connectivity": "Bluetooth 5.4 + Multipoint + NFC + USB-C DAC", "Frequency Response": "4Hz–50kHz (Hi-Res Audio Certified)", "Microphone": "12-Mic Studio-grade AI Spatial Beam", "Weight": "195g", "Foldable": "Yes – 3-axis fold + premium leather case", "Warranty": "Lifetime Warranty", "Reviews": "1,48,000+ buyers" },
  ],

  "Footwear": [
    // 0 Economy
    { "Upper Material": "Basic Mesh", "Sole Material": "Standard EVA Foam", "Cushioning": "Flat Foam Pad", "Breathability": "Low – Standard Mesh", "Arch Support": "None", "Weight per Shoe": "340g", "Available Sizes": "UK 6–10", "Waterproof": "No", "Warranty": "1 Month", "Reviews": "3,200+ buyers" },
    // 1 Basic
    { "Upper Material": "Synthetic Mesh", "Sole Material": "EVA + Rubber Outsole", "Cushioning": "1cm EVA Midsole", "Breathability": "Medium – Perforated Mesh", "Arch Support": "Minimal Foam Arch", "Weight per Shoe": "320g", "Available Sizes": "UK 6–10", "Waterproof": "No", "Warranty": "3 Months", "Reviews": "7,800+ buyers" },
    // 2 Standard
    { "Upper Material": "Engineered Mesh", "Sole Material": "Phylon + Rubber", "Cushioning": "Dual-layer Midsole", "Breathability": "Medium-High", "Arch Support": "Soft Arch Support", "Weight per Shoe": "300g", "Available Sizes": "UK 5–12", "Waterproof": "Water-resistant", "Warranty": "6 Months", "Reviews": "14,300+ buyers" },
    // 3 Standard+
    { "Upper Material": "Knit Mesh", "Sole Material": "Lightweight Phylon", "Cushioning": "Air-cushion Heel", "Breathability": "High – Knit Ventilation", "Arch Support": "Medium Arch Cradle", "Weight per Shoe": "285g", "Available Sizes": "UK 5–12", "Waterproof": "Water-resistant", "Warranty": "6 Months", "Reviews": "21,000+ buyers" },
    // 4 Advanced
    { "Upper Material": "Premium Knit Flyweave", "Sole Material": "React Foam", "Cushioning": "React Energy Return", "Breathability": "High – Adaptive Knit", "Arch Support": "Contoured Arch Support", "Weight per Shoe": "270g", "Available Sizes": "UK 4–13", "Waterproof": "Water Shield Coating", "Warranty": "1 Year", "Reviews": "38,500+ buyers" },
    // 5 Premium
    { "Upper Material": "Jacquard Flyknit", "Sole Material": "Carbon Fiber Reinforced Rubber", "Cushioning": "Zoom Air Units", "Breathability": "Ultra-Mesh Airknit", "Arch Support": "Dynamic Arch Support System", "Weight per Shoe": "255g", "Available Sizes": "UK 4–14", "Waterproof": "Gore-Tex Lining", "Warranty": "1 Year", "Reviews": "58,200+ buyers" },
    // 6 Premium+
    { "Upper Material": "3D-Knit Adaptive Upper", "Sole Material": "Full Carbon Fiber Plate", "Cushioning": "ZoomX Foam + Air Zoom", "Breathability": "Breathable 3D-Knit Adaptive", "Arch Support": "Orthotic-grade Cushioning", "Weight per Shoe": "238g", "Available Sizes": "UK 4–14", "Waterproof": "eVent Waterproof Membrane", "Warranty": "1.5 Years", "Reviews": "79,400+ buyers" },
    // 7 Pro
    { "Upper Material": "Hyperfuse Lightweight", "Sole Material": "Aerospace Carbon Fiber Reinforced Rubber", "Cushioning": "Pebax Foam + Responsive Plate", "Breathability": "Ultra-Mesh + Dynamic Ventilation Zones", "Arch Support": "Orthotic-grade + Medial Post", "Weight per Shoe": "220g", "Available Sizes": "UK 3–15", "Waterproof": "Gore-Tex Active", "Warranty": "1.5 Years", "Reviews": "1,04,000+ buyers" },
    // 8 Pro Max
    { "Upper Material": "Nano-Woven Adaptive Flyknit", "Sole Material": "Aerospace Carbon Fiber + Graphene Outsole", "Cushioning": "Next% Pebax + Dual Air Zoom", "Breathability": "Nano-Mesh Airknit 360°", "Arch Support": "Orthotic High Cushioning + Medial Stabiliser", "Weight per Shoe": "198g", "Available Sizes": "UK 3–15, Half Sizes", "Waterproof": "Gore-Tex Surround Active", "Warranty": "1.5 Years", "Reviews": "1,38,000+ buyers" },
    // 9 Elite
    { "Upper Material": "Bio-knit Recycled Ultra-Adaptive Upper", "Sole Material": "Aerospace Carbon Fibre + Graphene Nano Outsole", "Cushioning": "Next% Pebax Pro + Tristar Air Zoom Array", "Breathability": "360° Bio-Nano Mesh with Micro-Vent Zones", "Arch Support": "Custom Orthotic Memory Foam + Dual Stabilisers", "Weight per Shoe": "185g", "Available Sizes": "UK 2–16, Half & Wide Sizes", "Waterproof": "Gore-Tex Invisible Fit Membrane", "Warranty": "Lifetime Warranty", "Reviews": "1,82,000+ buyers" },
  ],

  "Fashion": [
    // 0 Economy
    { "Fabric Composition": "50% Polyester, 50% Cotton", "GSM (Fabric Weight)": "140 GSM", "Fit": "Loose Box Fit", "Stitching": "Single Overlock", "Colorfastness": "30 Washes", "Shrinkage Control": "None", "Available Sizes": "S, M, L, XL", "Care": "Machine Wash Cold", "Warranty": "30 Days", "Reviews": "4,100+ buyers" },
    // 1 Basic
    { "Fabric Composition": "60% Cotton, 40% Polyester", "GSM (Fabric Weight)": "160 GSM", "Fit": "Regular Fit", "Stitching": "Single Overlock + Tape", "Colorfastness": "50 Washes", "Shrinkage Control": "Pre-shrunk", "Available Sizes": "S, M, L, XL, XXL", "Care": "Machine Wash Warm", "Warranty": "60 Days", "Reviews": "9,600+ buyers" },
    // 2 Standard
    { "Fabric Composition": "80% Cotton, 20% Polyester", "GSM (Fabric Weight)": "175 GSM", "Fit": "Semi-Slim Fit", "Stitching": "Double Overlock", "Colorfastness": "75 Washes", "Shrinkage Control": "Enzyme Treated", "Available Sizes": "XS–XXL", "Care": "Machine Wash Warm", "Warranty": "90 Days", "Reviews": "18,200+ buyers" },
    // 3 Standard+
    { "Fabric Composition": "95% Cotton, 5% Elastane", "GSM (Fabric Weight)": "185 GSM", "Fit": "Slim Fit", "Stitching": "Double Lockstitch", "Colorfastness": "100 Washes", "Shrinkage Control": "Pre-shrunk + Enzyme", "Available Sizes": "XS–3XL", "Care": "Machine Wash", "Warranty": "6 Months", "Reviews": "27,900+ buyers" },
    // 4 Advanced
    { "Fabric Composition": "100% Ring-spun Cotton", "GSM (Fabric Weight)": "195 GSM", "Fit": "Athletic Slim Fit", "Stitching": "Reinforced Double Lockstitch", "Colorfastness": "150 Washes", "Shrinkage Control": "Compacted + Enzyme", "Available Sizes": "XS–4XL", "Care": "Machine Wash, Tumble Dry Low", "Warranty": "6 Months", "Reviews": "43,100+ buyers" },
    // 5 Premium
    { "Fabric Composition": "100% Pima Organic Cotton", "GSM (Fabric Weight)": "200 GSM", "Fit": "Tailored Premium Fit", "Stitching": "Reinforced Double Lock Stitch", "Colorfastness": "200 Washes (Color-stay)", "Shrinkage Control": "Zero-shrink Finishing", "Available Sizes": "XS–4XL", "Care": "Machine Wash Cold, Inside Out", "Warranty": "1 Year Color Stay", "Reviews": "61,800+ buyers" },
    // 6 Premium+
    { "Fabric Composition": "100% Supima Organic Cotton", "GSM (Fabric Weight)": "210 GSM", "Fit": "Precision Tailored Fit", "Stitching": "Triple-lock Stitch with Tape", "Colorfastness": "300 Washes (Reactive Dye)", "Shrinkage Control": "Sanforized Zero-shrink", "Available Sizes": "XS–5XL", "Care": "Machine/Hand Wash Cold", "Warranty": "1 Year Color Stay", "Reviews": "84,500+ buyers" },
    // 7 Pro
    { "Fabric Composition": "100% GOTS Certified Pima Long-Staple Cotton", "GSM (Fabric Weight)": "220 GSM", "Fit": "Bespoke Athletic Tailored Fit", "Stitching": "4-Thread Overlocked + Double Topstitch", "Colorfastness": "Fade-proof (400 Washes)", "Shrinkage Control": "Compacted + Sanforized", "Available Sizes": "XS–6XL", "Care": "Machine Wash 30°C, Inside Out", "Warranty": "2 Years Color Stay", "Reviews": "1,10,000+ buyers" },
    // 8 Pro Max
    { "Fabric Composition": "100% Egyptian Long-Staple Organic Cotton (GOTS + OEKO-TEX)", "GSM (Fabric Weight)": "230 GSM", "Fit": "Anatomic Bespoke Fit", "Stitching": "5-Thread Safety Stitch + Double Topstitch", "Colorfastness": "Fade-proof (600 Washes) – Reactive Pigment", "Shrinkage Control": "Compacted + Sanforized + Enzyme", "Available Sizes": "XS–6XL, Custom Size Option", "Care": "Machine Wash 30°C, Delicate – or Hand Wash", "Warranty": "2 Years Full Fabric Warranty", "Reviews": "1,41,000+ buyers" },
    // 9 Elite
    { "Fabric Composition": "100% Hand-picked Egyptian Sea Island Cotton (Ultra-premium, GOTS + OEKO-TEX + BCI)", "GSM (Fabric Weight)": "240 GSM", "Fit": "Custom Bespoke Anatomic Fit", "Stitching": "6-Thread French Seam + Triple Topstitch", "Colorfastness": "Permanent Dye (800+ Washes)", "Shrinkage Control": "Zero-shrink Nano-finish", "Available Sizes": "XS–7XL, Custom Sizing + Monogram", "Care": "Machine Wash Cold, Delicate – Iron Inside Out", "Warranty": "Lifetime Fabric Warranty", "Reviews": "1,89,000+ buyers" },
  ],

  "Home & Kitchen": [
    // 0 Economy
    { "Pieces in Set": "3-Piece", "Base Material": "Single-layer Sheet Aluminum (0.8mm)", "Coating": "Single-layer PTFE (non-stick)", "Handle Type": "Basic Welded Plastic", "Heat Distribution": "Uneven – thin base", "Induction Compatible": "No", "Oven Safe": "No", "Dishwasher Safe": "No", "Warranty": "3 Months", "Reviews": "6,200+ buyers" },
    // 1 Basic
    { "Pieces in Set": "4-Piece", "Base Material": "Pressed Sheet Aluminum (1.2mm)", "Coating": "2-Layer PTFE non-stick", "Handle Type": "Riveted Plastic", "Heat Distribution": "Basic – thin base", "Induction Compatible": "No", "Oven Safe": "Up to 120°C", "Dishwasher Safe": "Hand wash recommended", "Warranty": "6 Months", "Reviews": "12,800+ buyers" },
    // 2 Standard
    { "Pieces in Set": "5-Piece", "Base Material": "Die-cast Aluminum (2mm)", "Coating": "3-Layer PTFE non-stick", "Handle Type": "Riveted Stay-Cool Plastic", "Heat Distribution": "Good – encapsulated base", "Induction Compatible": "Partial (with adapter)", "Oven Safe": "Up to 150°C", "Dishwasher Safe": "Yes (top rack)", "Warranty": "1 Year", "Reviews": "24,500+ buyers" },
    // 3 Standard+
    { "Pieces in Set": "5-Piece", "Base Material": "Hard Anodized Aluminum (2.5mm)", "Coating": "3-Layer Titanium non-stick", "Handle Type": "Stay-Cool Bakelite Premium", "Heat Distribution": "Even – thick base", "Induction Compatible": "Yes", "Oven Safe": "Up to 175°C", "Dishwasher Safe": "Yes", "Warranty": "2 Years", "Reviews": "38,700+ buyers" },
    // 4 Advanced
    { "Pieces in Set": "6-Piece", "Base Material": "Hard Anodized Aluminum (3mm)", "Coating": "4-Layer Titanium Ceramic non-stick", "Handle Type": "Ergonomic Stay-Cool Bakelite", "Heat Distribution": "Even – impact-bonded base", "Induction Compatible": "Yes", "Oven Safe": "Up to 200°C", "Dishwasher Safe": "Yes", "Warranty": "2 Years", "Reviews": "57,300+ buyers" },
    // 5 Premium
    { "Pieces in Set": "6-Piece", "Base Material": "Hard Anodized Aluminum (3.5mm)", "Coating": "5-Layer Granite non-stick", "Handle Type": "Riveted Stay-Cool Stainless Steel", "Heat Distribution": "Excellent – clad base", "Induction Compatible": "Yes – All Cooktops", "Oven Safe": "Up to 220°C", "Dishwasher Safe": "Yes", "Warranty": "3 Years", "Reviews": "79,100+ buyers" },
    // 6 Premium+
    { "Pieces in Set": "7-Piece", "Base Material": "Tri-ply Stainless Steel (3mm total)", "Coating": "5-Layer Diamond non-stick", "Handle Type": "Forged Stainless Steel + Silicone Grip", "Heat Distribution": "Professional even heat", "Induction Compatible": "Yes – All Cooktops including Halogen", "Oven Safe": "Up to 240°C", "Dishwasher Safe": "Yes – sanitize mode safe", "Warranty": "5 Years", "Reviews": "1,02,000+ buyers" },
    // 7 Pro
    { "Pieces in Set": "7-Piece", "Base Material": "5-ply Aluminum Core + SS outer (4mm total)", "Coating": "6-Layer Ceramic Diamond non-stick", "Handle Type": "Ergonomic Forged SS with Silicon Flex Grip", "Heat Distribution": "Ultra-even – full 5-ply clad", "Induction Compatible": "Yes – All Cooktops + Commercial Grade", "Oven Safe": "Up to 260°C", "Dishwasher Safe": "Yes – commercial dishwasher safe", "Warranty": "5 Years", "Reviews": "1,31,000+ buyers" },
    // 8 Pro Max
    { "Pieces in Set": "8-Piece", "Base Material": "Tri-ply Heavy Stainless Steel (5mm total clad)", "Coating": "6-Layer Diamond Granite + PFOA-free Ceramic Seal", "Handle Type": "Riveted Stay-Cool Stainless Steel + Silicone Wrap", "Heat Distribution": "Professional restaurant-grade even heat", "Induction Compatible": "Yes – All Cooktops incl. Commercial Induction", "Oven Safe": "Up to 280°C / Broiler Safe", "Dishwasher Safe": "Yes – high-temp sanitize safe", "Warranty": "5 Years", "Reviews": "1,58,000+ buyers" },
    // 9 Elite
    { "Pieces in Set": "12-Piece Full Set", "Base Material": "5-ply Copper Core + Premium SS (6mm total clad)", "Coating": "8-Layer Ceramic Diamond Platinum + Nano-seal", "Handle Type": "Ergonomic Forged SS + Medical-grade Silicone Heat Shield", "Heat Distribution": "Michelin-star chef grade – copper-core rapid even heat", "Induction Compatible": "Yes – All Cooktops incl. High-Watt Commercial Induction", "Oven Safe": "Up to 315°C / Broiler + Salamander Safe", "Dishwasher Safe": "Yes – industrial dishwasher & autoclave safe", "Warranty": "Lifetime Warranty", "Reviews": "2,04,000+ buyers" },
  ],

  "Fitness": [
    // 0 Economy
    { "Thickness": "3mm Basic Foam", "Material": "Standard PVC Plastic", "Size": "170 × 60cm", "Anti-slip": "Single-sided bumps", "Alignment Guides": "None", "Carry Strap": "No", "Eco-friendly": "No", "Weight": "900g", "Warranty": "1 Month", "Reviews": "5,100+ buyers" },
    // 1 Basic
    { "Thickness": "4mm Foam", "Material": "PVC with soft top", "Size": "172 × 61cm", "Anti-slip": "Single-sided wave texture", "Alignment Guides": "None", "Carry Strap": "Basic Elastic Loop", "Eco-friendly": "No", "Weight": "850g", "Warranty": "3 Months", "Reviews": "11,300+ buyers" },
    // 2 Standard
    { "Thickness": "5mm Foam", "Material": "NBR Foam", "Size": "173 × 61cm", "Anti-slip": "Single-sided grip dots", "Alignment Guides": "Basic center line", "Carry Strap": "Adjustable Nylon Strap", "Eco-friendly": "Partial (30% recycled)", "Weight": "800g", "Warranty": "6 Months", "Reviews": "22,700+ buyers" },
    // 3 Standard+
    { "Thickness": "6mm Comfort Layer", "Material": "TPE Single Color", "Size": "173 × 62cm", "Anti-slip": "Both sides – different texture", "Alignment Guides": "Center + hand lines", "Carry Strap": "Adjustable Cotton Strap", "Eco-friendly": "Yes (TPE recyclable)", "Weight": "760g", "Warranty": "6 Months", "Reviews": "34,900+ buyers" },
    // 4 Advanced
    { "Thickness": "6mm Comfort TPE", "Material": "TPE Dual-Color Texture", "Size": "175 × 62cm", "Anti-slip": "Double-sided Premium grip", "Alignment Guides": "Full-body alignment grid", "Carry Strap": "Premium Cotton Carrier Bag", "Eco-friendly": "Yes (BPA-free TPE)", "Weight": "720g", "Warranty": "1 Year", "Reviews": "49,600+ buyers" },
    // 5 Premium
    { "Thickness": "6mm Comfort Layer", "Material": "TPE Dual-Color Texture", "Size": "175 × 63cm", "Anti-slip": "Double-sided Premium grip", "Alignment Guides": "Full-body alignment grid + chakra marks", "Carry Strap": "Premium Cotton Carrier with Pocket", "Eco-friendly": "Yes (OEKO-TEX certified TPE)", "Weight": "700g", "Warranty": "1 Year", "Reviews": "68,200+ buyers" },
    // 6 Premium+
    { "Thickness": "8mm High-Density TPE", "Material": "Natural Rubber + TPE Top Layer", "Size": "176 × 63cm", "Anti-slip": "Double-sided — microfiber top, natural rubber base", "Alignment Guides": "Printed full-body alignment + chakra symbols", "Carry Strap": "Premium Cotton Carry Bag + adjustable strap", "Eco-friendly": "Yes (Natural rubber + recycled TPE)", "Weight": "1.5kg", "Warranty": "2 Years", "Reviews": "91,800+ buyers" },
    // 7 Pro
    { "Thickness": "10mm High-Density Cushion", "Material": "Natural Eco-Friendly Rubber (anti-microbial)", "Size": "178 × 63cm", "Anti-slip": "Double-sided Premium grip – microfiber suede top", "Alignment Guides": "Laser-printed full-body grid + chakra + pose zones", "Carry Strap": "Premium Organic Cotton Carrier Bag with Zipper", "Eco-friendly": "Yes (Natural rubber, biodegradable, FSC certified)", "Weight": "2.1kg", "Warranty": "2 Years", "Reviews": "1,18,000+ buyers" },
    // 8 Pro Max
    { "Thickness": "10mm High-Density Natural Rubber Cushion", "Material": "Natural Eco-Friendly Rubber + Suede Microfiber Top", "Size": "183 × 66cm (Extra Long)", "Anti-slip": "Double-sided — Non-slip suede top + natural rubber base grip", "Alignment Guides": "Laser-engraved full-body grid + chakra + pose guides", "Carry Strap": "Premium Organic Cotton Carrier Bag with Zipper + Shoulder Strap", "Eco-friendly": "Yes (100% Natural Rubber, FSC-Certified, Biodegradable)", "Weight": "2.5kg", "Warranty": "2 Years", "Reviews": "1,48,000+ buyers" },
    // 9 Elite
    { "Thickness": "12mm Ultra-Cushion Cork + Natural Rubber", "Material": "Sustainable Cork Top + Anti-microbial Natural Rubber Base", "Size": "185 × 68cm (Extra Long/Wide)", "Anti-slip": "Triple-layer — Cork micro-grip top + suede buffer + natural rubber base", "Alignment Guides": "Laser-engraved full-body grid + chakra + pose zones + meridian lines", "Carry Strap": "Premium Hemp + Cotton Carry Bag with Dual Zipper + Trolley Sleeve", "Eco-friendly": "Yes (Cork renewable, 100% Natural Rubber, Zero-VOC inks, FSC + OEKO-TEX certified)", "Weight": "2.9kg", "Warranty": "Lifetime Warranty", "Reviews": "1,97,000+ buyers" },
  ],
};

const PRODUCT_IMAGES = {
  "Electronics": [
    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1572536147248-ac59a8abfa4b?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1545127398-14699f92334b?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1524678606370-a47ad25cb82a?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=600&q=80"
  ],
  "Footwear": [
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1560769629-975ec94e6a86?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1539185441755-769473a23570?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1515955656352-a1fa3ffcd111?auto=format&fit=crop&w=600&q=80"
  ],
  "Fashion": [
    "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=600&q=80"
  ],
  "Home & Kitchen": [
    "https://images.unsplash.com/photo-1584992236310-6edddc08acff?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1588854337236-6889d631faa8?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1583778176476-4a8b02a64c01?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1584992236310-6edddc08acff?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1588854337236-6889d631faa8?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1583778176476-4a8b02a64c01?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80"
  ],
  "Fitness": [
    "https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1592432678016-e910b452f9a2?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1599447421416-3414500d18a5?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1592432678016-e910b452f9a2?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1599447421416-3414500d18a5?auto=format&fit=crop&w=600&q=80"
  ]
};

const CATEGORIES = [
  { category: "Electronics",    item: "Wireless Headphones",    basePrice: 1800 },
  { category: "Footwear",       item: "Running Shoes",          basePrice: 1500 },
  { category: "Fashion",        item: "Cotton T-Shirt",         basePrice: 400  },
  { category: "Home & Kitchen", item: "Non-Stick Cookware Set", basePrice: 2200 },
  { category: "Fitness",        item: "Yoga Mat",               basePrice: 700  },
];

const buildProducts = () => {
  const products = [];
  for (const cat of CATEGORIES) {
    const catSpecs = SPECS[cat.category];
    const catImages = PRODUCT_IMAGES[cat.category] || [];
    TIERS.forEach((t, idx) => {
      const specs = catSpecs[idx] || {};
      const image = catImages[idx] || catImages[0] || "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80";
      products.push({
        name: `${cat.item} - ${t.tier}`,
        description: `${t.tier} tier ${cat.item.toLowerCase()} in the ${cat.category} range.`,
        category: cat.category,
        qualityTier: t.tier,
        price: Math.round(cat.basePrice * t.mult),
        image: image,
        stock: 100 - idx * 5,
        rating: t.rating,
        specifications: specs,
      });
    });
  }
  return products;
};

const run = async () => {
  await connectDB();
  const products = buildProducts();
  await Product.deleteMany();
  await Product.insertMany(products);
  console.log(`Seeded ${products.length} products across ${CATEGORIES.length} categories (${TIERS.length} tiers each)`);
  console.log("Rich specs seeded: Quality, Material, Reviews, Warranty, Features for every tier!");
  process.exit();
};

run();