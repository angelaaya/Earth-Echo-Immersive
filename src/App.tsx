import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import Globe, { type EarthTextures, type GlobeFailure, type Waypoint } from './Globe';
import GlobeErrorBoundary from './GlobeErrorBoundary';
import './observatory.css';
import { EXPERIENCES, EXP_COPY, UI, type DialogKind, type Experience, type Lang } from './observatory/content';
import { ExperienceNavigator, InfoDialog, ObservatoryHeader, ScienceContextPanel } from './observatory/components';
import { IntroLayer, useCinematicIntro } from './observatory/intro';

const queryClient = new QueryClient();
const TEXTURE_URLS = {
  surface: `${import.meta.env.BASE_URL}textures/land_ocean_ice_2048.jpg`,
  clouds: `${import.meta.env.BASE_URL}textures/cloud_combined_2048.jpg`,
  lights: `${import.meta.env.BASE_URL}textures/land_ocean_ice_lights_2048.jpg`,
};

function Home() {
  const [language, setLanguage] = useState<Lang>('en');
  const [selected, setSelected] = useState<Waypoint | null>(null);
  const [focusVersion, setFocusVersion] = useState(0);
  const [textures, setTextures] = useState<EarthTextures | null>(null);
  const [textureState, setTextureState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const [globeFailure, setGlobeFailure] = useState<GlobeFailure | null>(null);
  const [globeAttempt, setGlobeAttempt] = useState(0);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [announce, setAnnounce] = useState('');
  const exploreRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const t = UI[language];
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const skipped = useRef(false);
  const intro = useCinematicIntro(rootRef);
  const introLink = useMemo(() => ({ progress: intro.progress, owning: intro.owning }), [intro.progress, intro.owning]);
  const { finish: finishIntro, run: runIntro, enter: enterIntro, replay: replayIntro } = intro;
  const [globeReady, setGlobeReady] = useState(false);
  const onGlobeReady = useCallback(() => { setGlobeReady(true); }, []);
  const failed = textureState === 'error' || Boolean(globeFailure);
  const enter = useCallback(() => {
    // A failed renderer never blocks: Enter reveals the real fallback immediately.
    if (failed) { finishIntro('aborted'); return; }
    enterIntro(globeReady);
  }, [failed, globeReady, enterIntro, finishIntro]);
  const replay = useCallback(() => { skipped.current = false; replayIntro(); }, [replayIntro]);
  const skipIntro = useCallback(() => { skipped.current = true; finishIntro('skipped'); }, [finishIntro]);

  // Main UI is unavailable to keyboard/AT while the intro is pending; only Skip is reachable.
  useEffect(() => {
    const m = mainRef.current;
    if (!m) return;
    if (intro.state === 'done') m.removeAttribute('inert'); else m.setAttribute('inert', '');
    if (intro.state === 'done' && skipped.current) {
      skipped.current = false;
      requestAnimationFrame(() => titleRef.current?.focus());
    }
  }, [intro.state]);
  useEffect(() => {
    if (intro.state === 'done') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') skipIntro(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [intro.state, skipIntro]);
  // Visitor already chose to enter: start once ready, fall back on failure, never strand.
  useEffect(() => {
    if (intro.state !== 'waiting') return;
    if (failed) { finishIntro('aborted'); return; }
    if (globeReady) { runIntro(); return; }
    const id = window.setTimeout(() => finishIntro('aborted'), 12000);
    return () => window.clearTimeout(id);
  }, [intro.state, failed, globeReady, runIntro, finishIntro]);
  // Failure during a running timeline settles immediately.
  useEffect(() => { if (failed && intro.state === 'running') finishIntro('aborted'); }, [failed, intro.state, finishIntro]);
  const introStatus = intro.state === 'waiting' ? t.introWaiting
    : failed ? t.introFallback
    : globeReady ? t.introReady : t.introPreparing;
  const uiOn = intro.stage === 'reveal' || intro.stage === 'final';

  const waypoints = useMemo(() => EXPERIENCES.map((e) => ({ ...e.waypoint, name: EXP_COPY[language][e.id].place })), [language]);
  const activeExp = useMemo(() => EXPERIENCES.find((e) => e.waypoint.id === selected?.id) ?? null, [selected]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  useEffect(() => {
    let active = true;
    const images: HTMLImageElement[] = [];
    const requests = (Object.entries(TEXTURE_URLS) as [keyof EarthTextures, string][]).map(([key, url]) => new Promise<[keyof EarthTextures, THREE.Texture]>((resolve, reject) => {
      const image = new Image();
      images.push(image);
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.onload = () => {
        const loadedTexture = new THREE.Texture(image);
        loadedTexture.colorSpace = THREE.SRGBColorSpace;
        loadedTexture.anisotropy = 8;
        loadedTexture.needsUpdate = true;
        resolve([key, loadedTexture]);
      };
      image.onerror = () => reject(new Error(`NASA map failed to load: ${key}`));
      image.src = url;
    }));
    Promise.allSettled(requests).then((results) => {
      const loaded = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
      if (!active || results.some((result) => result.status === 'rejected')) {
        loaded.forEach(([, loadedTexture]) => loadedTexture.dispose());
        if (active) setTextureState('error');
        return;
      }
      setTextures(Object.fromEntries(loaded) as unknown as EarthTextures);
      setTextureState('ready');
    });
    return () => {
      active = false;
      images.forEach((image) => { image.src = ''; });
    };
  }, [retry]);

  useEffect(() => () => {
    if (textures) Object.values(textures).forEach((texture) => texture.dispose());
  }, [textures]);

  const choosePlace = (place: Waypoint) => {
    setSelected(place);
    setFocusVersion((v) => v + 1);
    const exp = EXPERIENCES.find((e) => e.waypoint.id === place.id);
    setAnnounce(t.selectedAnnounce(exp ? EXP_COPY[language][exp.id].name : t.mapPoint));
  };
  const chooseExperience = (e: Experience) => {
    choosePlace(waypoints.find((w) => w.id === e.waypoint.id) ?? e.waypoint);
  };
  const clear = () => { setSelected(null); setExpanded(false); setFocusVersion((v) => v + 1); };
  const scrollBehavior = (): ScrollBehavior => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const focusExplore = () => { exploreRef.current?.focus(); exploreRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' }); };
  const focusExperiences = () => {
    const first = listRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ?? listRef.current?.querySelector<HTMLButtonElement>('button');
    first?.focus();
    first?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  };

  const globeLayer = (
    <section ref={exploreRef} tabIndex={-1} id="explore" aria-label={t.globeRegion} data-testid="section-globe" className={`ob-globe${globeFailure ? ' is-unavailable' : ''}${selected ? ' has-selection' : ''}`}>
      {globeFailure ? (
        <div className="state-card" role="alert" aria-atomic="true" data-testid="status-webgl-error">
          <p className="sci-kicker">EarthEcho / 3D</p>
          <h2>{globeFailure === 'context-lost' ? t.contextLostTitle : t.unavailableTitle}</h2>
          <p>{globeFailure === 'context-lost' ? t.contextLostBody : t.unavailableBody}</p>
          <p className="muted">{t.renderingAlternative}</p>
          <button type="button" className="btn btn-ghost btn-sm" data-testid="button-retry-3d" onClick={() => { setGlobeAttempt((v) => v + 1); setGlobeFailure(null); }}>{t.retry3d}</button>
        </div>
      ) : textureState === 'ready' && textures ? (
        <GlobeErrorBoundary key={globeAttempt} onFailure={() => setGlobeFailure('unavailable')}>
          <Globe textures={textures} waypoints={waypoints} selected={selected} onSelect={choosePlace} focusVersion={focusVersion} onFailure={setGlobeFailure}
            intro={introLink} onReady={onGlobeReady} rtl={language === 'ar'} />
        </GlobeErrorBoundary>
      ) : textureState === 'loading' ? (
        <div className="globe-wait" role="status" data-testid="status-loading"><span className="wait-orb" aria-hidden="true" /><span>{t.loading}</span></div>
      ) : (
        <div className="state-card" role="alert" data-testid="status-error">
          <h2>{t.failedTitle}</h2>
          <p>{t.failedBody}</p>
          <button type="button" className="btn btn-ghost btn-sm" data-testid="button-retry" onClick={() => { setTextureState('loading'); setRetry((v) => v + 1); }}>{t.retry}</button>
        </div>
      )}
      {!globeFailure && textureState === 'ready' && <p className="globe-hint" aria-hidden="true">{t.drag}<i /> {t.zoom}</p>}
    </section>
  );

  return (
    <div ref={rootRef} className="ob-root" data-testid="root-observatory" data-intro={intro.state} data-intro-stage={intro.stage}
      data-intro-end={intro.end ?? 'none'} data-intro-progress={intro.state === 'done' ? '1.000' : undefined}
      data-globe-ready={globeFailure ? 'failed' : globeReady ? 'ready' : 'pending'} data-texture-state={textureState} data-ui={uiOn ? 'on' : 'off'}>
      {intro.state !== 'done' && (
        <IntroLayer state={intro.state} frameCb={intro.frameCb} progress={intro.progress} onSkip={skipIntro} onEnter={enter}
          label={t.introLabel} enterLabel={t.enterIntro} skipLabel={t.skipIntro} status={introStatus} tagline={t.tagline} />
      )}
      <main ref={mainRef} id="top" data-testid="page-observatory" className={`ob${language === 'ar' ? ' rtl' : ''}${globeFailure || textureState === 'error' ? ' has-fallback' : ''}`} lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <a href="#experiences" className="skip-link" onClick={(e) => { e.preventDefault(); focusExperiences(); }}>{t.skip}</a>
        <div className="ob-atmos" aria-hidden="true" />
        <ObservatoryHeader t={t} lang={language} onLang={() => setLanguage(language === 'en' ? 'ar' : 'en')} onExplore={focusExplore} onExperiences={focusExperiences} onOpen={setDialog} />

        <div className="ob-stage">
          <section className="ob-hero rv rv-3" aria-labelledby="hero-title">
            <p className="ob-eyebrow"><span className="tick" aria-hidden="true" />{t.eyebrow}</p>
            <h1 id="hero-title" ref={titleRef} tabIndex={-1} className="ob-title" data-testid="text-hero-title"><span>{t.h1a}</span> <span className="soft">{t.h1b}</span></h1>
            <p className="ob-lead">{t.lead}</p>
            <div className="ob-actions">
              <button type="button" className="btn btn-primary" onClick={() => setDialog('listen')} aria-haspopup="dialog" data-testid="button-begin-listening">
                <svg viewBox="0 0 20 12" aria-hidden="true" className="btn-ico"><path d="M1 6h3M6 3v6M9 1v10M12 4v4M15 2v8M18 6h1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                {t.begin}
              </button>
              <button type="button" className="btn btn-ghost" onClick={focusExplore} data-testid="button-explore">
                {t.explore}
                <svg viewBox="0 0 16 16" aria-hidden="true" className="btn-ico-sm"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M2 8h12M8 2c2.2 2.4 2.2 9.6 0 12M8 2c-2.2 2.4-2.2 9.6 0 12" fill="none" stroke="currentColor" strokeWidth="1" opacity=".7" /></svg>
              </button>
            </div>
          </section>

          <div className="ob-window" aria-hidden="true" />

          <div className="ob-lower">
            <div className="ob-index rv rv-4">
              <ExperienceNavigator t={t} lang={language} activeId={activeExp?.id ?? null} onSelect={chooseExperience} listRef={listRef} />
            </div>
            <div className="ob-context rv rv-5">
              <ScienceContextPanel t={t} lang={language} experience={activeExp} place={selected} expanded={expanded}
                onToggle={() => setExpanded((v) => !v)} onListen={() => setDialog('listen')} onClear={clear} />
            </div>
          </div>
        </div>

        {globeLayer}

        <footer className="ob-foot rv rv-6">
          <p><span className="ob-micro">{t.micro}</span> {t.archival}</p>
          <p className="ob-credits">
            <a href={TEXTURE_URLS.surface} target="_blank" rel="noreferrer" data-testid="link-surface">{t.surface}</a>
            <a href={TEXTURE_URLS.clouds} target="_blank" rel="noreferrer" data-testid="link-clouds">{t.clouds}</a>
            <a href={TEXTURE_URLS.lights} target="_blank" rel="noreferrer" data-testid="link-lights">{t.lights}</a>
          </p>
          <button type="button" className="btn-text" onClick={replay} data-testid="button-replay-intro">{t.replayIntro}</button>
        </footer>

        <p className="sr-only" aria-live="polite" data-testid="status-announce">{announce}</p>
        <InfoDialog kind={dialog} lang={language} t={t} onClose={() => setDialog(null)} />
      </main>
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={new URL(import.meta.env.BASE_URL, document.baseURI).pathname.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
