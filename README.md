# QuillDocs - Intelligent Multi-Format Document AI & Research Assistant

[![Next.js](https://img.shields.io/badge/Next.js-14.0-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5.7-2D3748?logo=prisma)](https://www.prisma.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb)](https://www.mongodb.com/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.3-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![Paystack](https://img.shields.io/badge/Payment-Paystack-0BA4DB)](https://paystack.com/)

**QuillDocs** is a full-stack, enterprise-grade AI research and study assistant. Transform static documents into interactive conversations with high-speed streaming AI responses, semantic vector indexing, multi-document cross-synthesis, and integrated payment processing.

---

## ✨ Core Features

* **Multi-Format Document Support**: Native viewer and parsing for **PDFs**, **Word Documents (`.docx`, `.doc`)**, and **PowerPoint Presentations (`.pptx`, `.ppt`)**.
* **Multi-Document Synthesis**: Chat with multiple research papers or slide decks simultaneously in a unified multi-doc workspace.
* **State-of-the-Art AI Inference**: Powered by Google Gemini 2.5 Flash via OpenRouter with automatic multi-model failover (GPT-4o-mini, DeepSeek-Chat, Llama 3.3).
* **Vector Semantic Search**: High-precision semantic retrieval powered by Pinecone with 1536-dimensional embeddings.
* **Paystack Payment Gateway**:
  * Direct Naira (NGN) billing (₦18,000 / month Pro tier).
  * Supports Nigerian Debit Cards (Mastercard, Visa, Verve), instant Bank Transfer (virtual accounts), USSD, and OPay.
  * Direct acceptance of international cards (USD, GBP, EUR Visa/Mastercard/Apple Pay) with automatic FX conversion settling directly to your standard Nigerian personal bank account — zero domiciliary account or CAC required.
  * Webhook listener with HMAC SHA-512 cryptographic verification and instant client-side verification fallback.
* **Role-Based Admin Dashboard (`/admin`)**:
  * **Plans & Quotas**: Dynamically modify pricing in USD and NGN, adjust upload quotas, page limits, and file size ceilings right from the browser with zero server restarts.
  * **User Management**: Search, promote/demote roles (`ADMIN` / `USER`), grant or revoke subscriptions, and suspend accounts.
  * **Inquiries & Settings**: Manage public contact form submissions and customize contact details.
* **Mobile-Optimized UX**:
  * Native grab handles and keyboard dismissal buttons.
  * Anchored viewport preventing disruptive mobile keypad scroll jumps.
  * Responsive side drawers and synchronized dark/light document renderers.

---

## 🛠️ Tech Stack

* **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide Icons, Radix UI.
* **Backend**: Next.js API Routes, tRPC v10, Zod validation.
* **Database & ORM**: MongoDB Atlas, Prisma ORM.
* **Authentication**: Kinde Auth (OAuth, Social, Passwordless).
* **Vector Database**: Pinecone Serverless Vector Search.
* **File Storage**: UploadThing (Vercel serverless) / Direct server uploads.
* **Payments**: Paystack API & Webhooks (NGN & International Cards).

---

## 🚀 Getting Started

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/thecoachmanuel/quilldocsapp.git
cd quilldocsapp
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory (or copy from `.env.example`):

```bash
cp .env.example .env
```

Fill in the required keys:

```env
# AI Provider (OpenRouter)
OPENROUTER_API_KEY=sk-or-v1-...
AI_MODEL=google/gemini-2.5-flash

# Kinde Authentication
KINDE_CLIENT_ID=your_client_id
KINDE_CLIENT_SECRET=your_client_secret
KINDE_ISSUER_URL=https://<your-subdomain>.kinde.com
KINDE_SITE_URL=http://localhost:3000
KINDE_POST_LOGOUT_REDIRECT_URL=http://localhost:3000
KINDE_POST_LOGIN_REDIRECT_URL=http://localhost:3000/dashboard

# MongoDB Database
DATABASE_URL="mongodb+srv://<username>:<password>@cluster0.mongodb.net/quilldocs?retryWrites=true&w=majority"

# Vector Database (Pinecone)
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX_HOST=...

# Paystack Payment Gateway
PAYSTACK_PUBLIC_KEY=pk_test_...
PAYSTACK_SECRET_KEY=sk_test_...
PAYSTACK_PRO_AMOUNT_KOBO=1800000

# File Uploads (UploadThing)
UPLOADTHING_SECRET=sk_live_...
UPLOADTHING_APP_ID=...
```

### 3. Initialize & Seed Database

Push the Prisma schema to MongoDB Atlas and populate initial plans and contact settings:

```bash
npx prisma db push
npm run seed
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🌐 Deploying to Vercel

1. Push your repository to GitHub.
2. Import the project into **[Vercel](https://vercel.com)**.
3. In your Vercel Project Settings &rarr; **Environment Variables**, add all keys from your `.env`:
   * Set `KINDE_SITE_URL` to your production Vercel domain (e.g. `https://quilldocsapp.vercel.app`).
   * Set `KINDE_POST_LOGOUT_REDIRECT_URL` to `https://quilldocsapp.vercel.app`.
   * Set `KINDE_POST_LOGIN_REDIRECT_URL` to `https://quilldocsapp.vercel.app/dashboard`.
   * Include `UPLOADTHING_SECRET` and `UPLOADTHING_APP_ID` for serverless cloud file storage.
4. In your **Kinde Application Settings** (at [app.kinde.com](https://app.kinde.com)):
   * Add `https://quilldocsapp.vercel.app/api/auth/kinde_callback` to **Allowed callback URLs**.
   * Add `https://quilldocsapp.vercel.app` to **Allowed logout redirect URLs**.
5. In your **Paystack Dashboard** (at [dashboard.paystack.com](https://dashboard.paystack.com)):
   * Set your Webhook URL to: `https://quilldocsapp.vercel.app/api/webhooks/paystack`.
6. Click **Deploy**.

---

## 📄 License

This project is licensed under the MIT License.
