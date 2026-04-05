# Quant Radar

This folder is now a deployable Next.js app that proxies your AWS backend through internal API routes.

## Environment

Create `.env.local` from the example file:

```bash
cp .env.local.example .env.local
```

Fill these values:

```env
AWS_API_URL=https://your-aws-function-url.amazonaws.com/
RADAR_SECRET=your-secret
```

Your AWS backend already expects:

- `route=smart-radar`
- `route=market-velocity`
- `route=sector-heatmap`
- `route=ai-signals`

The frontend sends those automatically through `/api/radar`, `/api/pulse`, `/api/sector`, and `/api/ai`.

## Local Run

From inside [`quant-radar`](c:\Users\RK\Desktop\PROJECT QUANT\quant-radar):

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production Build

```bash
npm run build
npm start
```

## Deploy

Vercel:

1. Import the `quant-radar` folder as a Next.js project.
2. Set `AWS_API_URL` and `RADAR_SECRET` in Project Settings -> Environment Variables.
3. Deploy.

Any Node host:

1. Copy the `quant-radar` folder to the server.
2. Run `npm install`.
3. Set `AWS_API_URL` and `RADAR_SECRET`.
4. Run `npm run build`.
5. Run `npm start`.

## Important Note

The original raw revamp files are still in this folder, but the app now uses the proper Next.js structure under:

- [`app`](c:\Users\RK\Desktop\PROJECT QUANT\quant-radar\app)
- [`components`](c:\Users\RK\Desktop\PROJECT QUANT\quant-radar\components)
- [`utils`](c:\Users\RK\Desktop\PROJECT QUANT\quant-radar\utils)
