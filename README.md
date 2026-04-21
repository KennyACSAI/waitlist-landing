# Yoova — Waitlist Landing

Waitlist landing page for Yoova, a social discovery platform where every
connection starts at a real event. Brand color `#28aa97`.

## Stack

- React 19 + TypeScript
- Vite 6
- Tailwind CSS 3
- `@react-three/fiber` + `three`

## File structure

```
waitlist-landing/
├─ index.html
├─ package.json
├─ vite.config.ts
├─ tailwind.config.js, postcss.config.js
├─ tsconfig.json, tsconfig.node.json
└─ src/
   ├─ main.tsx, App.tsx, index.css
   ├─ components/
   │  ├─ YoovaLogo.tsx
   │  └─ WaitlistForm.tsx       — email / loading / success / error states
   └─ three/
      ├─ HeroScene.tsx          — the single <Canvas>
      ├─ ParticleField.tsx      — points + custom ShaderMaterial; pin-formation on submit
      └─ particleStore.ts       — mood refs shared between DOM and useFrame
```

## Run

```bash
cd waitlist-landing
yarn install
yarn dev         # opens http://localhost:5173
```

Production build:

```bash
yarn build
yarn preview
```

## Wire up the waitlist API

`src/components/WaitlistForm.tsx` has a `setTimeout` stub. Replace it with your
endpoint:

```ts
await fetch('/api/waitlist', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email }),
})
```
