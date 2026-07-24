// Barrel for the vendored React Bits components we use (TS + plain-CSS variant,
// from reactbits.dev, MIT). Each component owns its companion .css. We keep only
// the dependency-light (motion-only / zero-dep) ones actually used in the app,
// for a lean mobile PWA:
//   CountUp     — animated number roll-ups (KPIs, forecast figures)
//   Stepper     — guided first-run onboarding
//   GradientText — brand headings
//   Waves       — subtle canvas backdrop on the dashboard hero
export { default as CountUp } from './CountUp/CountUp'
export { default as Stepper, Step } from './Stepper/Stepper'
export { default as GradientText } from './GradientText/GradientText'
export { default as Waves } from './Waves/Waves'
