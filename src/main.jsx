import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import './styles.css';

const VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const MODRINTH = 'https://api.modrinth.com/v2';
const PROFILE_KEY = 'sakura.profile.v2';
const BUILDS_KEY = 'sakura.builds.v2';

function loadJson(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function formatSize(n) { if (!n) return ''; if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`; return `${(n / 1024 / 1024).toFixed(1)} MB`; }
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 42) || 'build'; }

function App() {
  const [profile, setProfile] = useState(() => loadJson(PROFILE_KEY, null));
  const [builds, setBuilds] = useState(() => loadJson(BUILDS_KEY, []));
  const [tab, setTab] = useState('home');
  const [selectedId, setSelectedId] = useState(() => loadJson(BUILDS_KEY, [])[0]?.id || null);
  const [versions, setVersions] = useState([]);
  const [versionFilter, setVersionFilter] = useState('release');
  const [versionSearch, setVersionSearch] = useState('');
  const [versionLoading, setVersionLoading] = useState(false);
  const [versionError, setVersionError] = useState('');
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [modQuery, setModQuery] = useState('');
  const [mods, setMods] = useState([]);
  const [modLoading, setModLoading] = useState(false);
  const [modLoader, setModLoader] = useState('fabric');
  const [modVersion, setModVersion] = useState('');

  const selected = builds.find(b => b.id === selectedId) || builds[0] || null;

  useEffect(() => saveJson(BUILDS_KEY, builds), [builds]);
  useEffect(() => { if (builds.length && !builds.some(b => b.id === selectedId)) setSelectedId(builds[0].id); }, [builds, selectedId]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 4200); return () => clearTimeout(t); }, [notice]);

  async function fetchVersions() {
    setVersionLoading(true); setVersionError('');
    try {
      const res = await fetch(VERSION_MANIFEST);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setVersions(data.versions || []);
    } catch (e) { setVersionError('Не удалось получить список Minecraft. Проверь интернет.'); }
    finally { setVersionLoading(false); }
  }
  useEffect(() => { if (tab === 'versions' && !versions.length) fetchVersions(); }, [tab]);

  async function searchMods() {
    setModLoading(true);
    try {
      const facets = [["project_type:mod"], ["categories:" + modLoader]];
      if (modVersion) facets.push([`versions:${modVersion}`]);
      const params = new URLSearchParams({ query: modQuery || 'minecraft', limit: '24', index: 'relevance', facets: JSON.stringify(facets) });
      const res = await fetch(`${MODRINTH}/search?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json(); setMods(data.hits || []);
    } catch { setNotice('Modrinth недоступен. Попробуй ещё раз.'); }
    finally { setModLoading(false); }
  }
  useEffect(() => { if (tab === 'mods' && !mods.length) searchMods(); }, [tab]);

  function createProfile(name) {
    const clean = name.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(clean)) return setNotice('Ник: 3–16 символов, только латиница, цифры и _.');
    const next = { nickname: clean, createdAt: Date.now() }; setProfile(next); saveJson(PROFILE_KEY, next);
  }
  function createBuild(data) {
    const build = { id: uid(), name: data.name.trim(), version: data.version, loader: data.loader, mods: [], createdAt: Date.now(), installed: false };
    const next = [...builds, build]; setBuilds(next); setSelectedId(build.id); setModal(null); setTab('home'); setNotice(`Сборка «${build.name}» создана.`);
  }
  function deleteBuild(id) {
    const b = builds.find(x => x.id === id); if (!b) return;
    if (!confirm(`Удалить сборку «${b.name}»? Файлы Minecraft на диске тоже будут удалены позже.`)) return;
    setBuilds(builds.filter(x => x.id !== id));
    setNotice(`Сборка «${b.name}» удалена из лаунчера.`);
  }
  async function installBuild(build) {
    if (!build) return;
    setBusy(true); setNotice('');
    try {
      const version = versions.find(v => v.id === build.version) || (await (await fetch(VERSION_MANIFEST)).json()).versions.find(v => v.id === build.version);
      if (!version) throw new Error('version not found');
      const meta = await (await fetch(version.url)).json();
      const clientUrl = meta.downloads?.client?.url;
      if (!clientUrl) throw new Error('client unavailable');
      const rel = `instances/${build.id}/minecraft/${build.version}`;
      await invoke('download_file', { url: version.url, relativePath: `${rel}/version.json` });
      await invoke('download_file', { url: clientUrl, relativePath: `${rel}/${build.version}.jar` });
      const updated = builds.map(b => b.id === build.id ? { ...b, installed: true, installedAt: Date.now(), versionUrl: version.url } : b);
      setBuilds(updated);
      setNotice(`Minecraft ${build.version} установлен в «${build.name}».`);
    } catch (e) { setNotice(`Не удалось установить ${build.version}: ${e?.toString?.() || e}`); }
    finally { setBusy(false); }
  }
  async function installMod(project) {
    if (!selected) return setNotice('Сначала создай или выбери сборку.');
    setBusy(true);
    try {
      const qs = new URLSearchParams(); if (modLoader) qs.set('loaders', JSON.stringify([modLoader])); if (selected.version) qs.set('game_versions', JSON.stringify([selected.version])); qs.set('featured', 'true');
      const res = await fetch(`${MODRINTH}/project/${project.project_id}/version?${qs}`);
      if (!res.ok) throw new Error(); const versionsForMod = await res.json();
      const v = versionsForMod[0]; const file = v?.files?.find(f => f.primary) || v?.files?.[0];
      if (!file) throw new Error('no compatible file');
      const safe = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      await invoke('download_file', { url: file.url, relativePath: `instances/${selected.id}/mods/${safe}` });
      const updated = builds.map(b => b.id === selected.id ? { ...b, mods: [...new Set([...(b.mods || []), file.filename])] } : b);
      setBuilds(updated); setNotice(`${project.title} добавлен в «${selected.name}».`);
    } catch { setNotice('Не удалось установить мод. Проверь версию и загрузчик.'); }
    finally { setBusy(false); }
  }
  async function chooseNativeFolder() {
    try { const path = await invoke('app_data_dir'); setNotice(`Данные Sakura: ${path}`); } catch { setNotice('Не удалось определить папку данных.'); }
  }

  const filteredVersions = useMemo(() => versions.filter(v => (versionFilter === 'all' || v.type === versionFilter) && v.id.toLowerCase().includes(versionSearch.toLowerCase())).slice(0, 100), [versions, versionFilter, versionSearch]);

  if (!profile) return <Onboarding onCreate={createProfile} />;

  return <div className="app">
    <div className="ambient a1"/><div className="ambient a2"/>
    <div className="petals">{Array.from({length: 30}, (_, i) => <i key={i} style={{'--i': i}} />)}</div>
    <aside>
      <div className="brand"><img src="/src/assets/icon.png"/><div><b>SAKURA</b><span>CRAFT LAUNCHER</span></div></div>
      <nav>{[['home','⌂','Главная'],['versions','◈','Версии'],['mods','✦','Моды'],['skins','◇','Скины']].map(x => <button className={tab === x[0] ? 'active' : ''} onClick={() => setTab(x[0])} key={x[0]}><em>{x[1]}</em>{x[2]}</button>)}</nav>
      <div className="sidebottom"><button onClick={() => setTab('settings')}>⚙ Настройки</button><small>v0.2.0 • real builds</small></div>
    </aside>
    <main>
      <header><div className="crumb">{({home:'Главная', versions:'Версии', mods:'Моды', skins:'Скины', settings:'Настройки'})[tab]}</div><div className="account"><span className="dot online"/>{profile.nickname}<b>⌄</b></div></header>
      {tab === 'home' && <Home selected={selected} builds={builds} setSelectedId={setSelectedId} onNew={() => setModal('build')} onInstall={installBuild} busy={busy} onDelete={deleteBuild} />}
      {tab === 'versions' && <Versions versions={filteredVersions} filter={versionFilter} setFilter={setVersionFilter} search={versionSearch} setSearch={setVersionSearch} loading={versionLoading} error={versionError} reload={fetchVersions} onCreate={v => setModal({type:'build', version:v.id})} />}
      {tab === 'mods' && <Mods query={modQuery} setQuery={setModQuery} loader={modLoader} setLoader={setModLoader} version={modVersion} setVersion={setModVersion} mods={mods} loading={modLoading} search={searchMods} selected={selected} install={installMod} busy={busy} />}
      {tab === 'skins' && <Empty title="Скины" text="Здесь будет локальная библиотека скинов и загрузка PNG в выбранный профиль." />}
      {tab === 'settings' && <Settings profile={profile} reset={() => { localStorage.removeItem(PROFILE_KEY); setProfile(null); }} showPath={chooseNativeFolder} />}
    </main>
    {modal && <BuildModal versions={versions.length ? versions : []} initialVersion={modal.version} onClose={() => setModal(null)} onCreate={createBuild} />}
    {notice && <div className="toast">{notice}</div>}
  </div>;
}

function Onboarding({onCreate}) { const [name,setName]=useState(''); return <div className="onboard"><div className="onboardCard"><img src="/src/assets/icon.png"/><span className="eyebrow">SAKURA LAUNCHER</span><h1>Добро пожаловать.</h1><p>Сначала выбери локальный ник. Он сохраняется на этом компьютере.</p><input autoFocus value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&onCreate(name)} placeholder="Твой ник" maxLength={16}/><button onClick={()=>onCreate(name)}>Продолжить <span>→</span></button><small>Автономный профиль не заменяет Microsoft-авторизацию Minecraft.</small></div></div> }

function Home({selected,builds,setSelectedId,onNew,onInstall,busy,onDelete}) { return <>
  <section className="hero"><div className="heroCopy"><span className="eyebrow">MINECRAFT JAVA EDITION</span><h1>Твой Minecraft.<br/><strong>Твой мир.</strong></h1><p>{selected ? `Продолжить «${selected.name}» · ${selected.version} · ${selected.loader}` : 'Создай первую сборку во вкладке «Версии».'}</p><div className="heroActions"><button className="play" disabled={!selected || busy} onClick={()=>onInstall(selected)}><span>▶</span>{busy?' УСТАНОВКА…':selected?.installed?' ПРОВЕРИТЬ / УСТАНОВИТЬ':' УСТАНОВИТЬ'}</button><button className="ghost" onClick={onNew}>＋</button></div></div><div className="world"><div className="moon"/><div className="mountain m1"/><div className="mountain m2"/><div className="tree"><div className="trunk"/><div className="crown"/></div><div className="ground"/></div></section>
  <section className="buildHead"><div><h2>Мои сборки</h2><p>{builds.length ? 'Только созданные тобой сборки' : 'Пока пусто — создай первую сборку.'}</p></div><button className="new" onClick={onNew}>＋ Новая сборка</button></section>
  <div className="builds">{builds.map(b=><article className={'build '+(selected?.id===b.id?'selected':'')} onClick={()=>setSelectedId(b.id)} key={b.id}><div className="cover"><span>{b.loader==='Fabric'?'F':b.loader==='Forge'?'F':b.loader==='NeoForge'?'N':'◇'}</span></div><div className="binfo"><h3>{b.name}</h3><p>{b.version} · {b.loader}</p><div className="meta"><span>{b.mods?.length || 0} модов</span><span>{b.installed?'установлено':'не установлено'}</span></div></div><button className="more" onClick={e=>{e.stopPropagation();onDelete(b.id)}}>×</button></article>)}</div>
  {!builds.length && <div className="noBuilds"><div>✦</div><b>Здесь будут только твои сборки</b><span>Выбери реальную версию Minecraft и нажми «Создать сборку».</span></div>}
</> }

function Versions({versions,filter,setFilter,search,setSearch,loading,error,reload,onCreate}) { return <section className="page"><div className="pageTop"><div><h1>Версии Minecraft</h1><p>Список берётся из официального version manifest Mojang.</p></div><button className="new" onClick={reload}>↻ Обновить</button></div><div className="toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск версии…"/><div className="chips">{['release','snapshot','old_beta','old_alpha','all'].map(x=><button className={filter===x?'on':''} onClick={()=>setFilter(x)} key={x}>{x==='release'?'Релизы':x==='snapshot'?'Снапшоты':x==='old_beta'?'Beta':x==='old_alpha'?'Alpha':'Все'}</button>)}</div></div>{loading&&<div className="loading">Получаю реальные версии…</div>}{error&&<div className="error">{error}</div>}<div className="versionGrid">{versions.map(v=><article className="versionCard" key={v.id}><div><b>{v.id}</b><span>{v.type}</span></div><button onClick={()=>onCreate(v)}>＋ Создать сборку</button></article>)}</div></section> }

function Mods({query,setQuery,loader,setLoader,version,setVersion,mods,loading,search,selected,install,busy}) { return <section className="page"><div className="pageTop"><div><h1>Моды</h1><p>Поиск по Modrinth. Установка идёт прямо в выбранную сборку.</p></div></div><div className="toolbar modbar"><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search()} placeholder="Например: sodium, minimap, create…"/><select value={loader} onChange={e=>setLoader(e.target.value)}><option value="fabric">Fabric</option><option value="forge">Forge</option><option value="neoforge">NeoForge</option><option value="quilt">Quilt</option></select><input value={version} onChange={e=>setVersion(e.target.value)} placeholder={selected?.version || '1.21.8'}/><button className="new" onClick={search}>Искать</button></div>{selected&&<div className="selectedBuild">Сборка: <b>{selected.name}</b> · {selected.version} · {selected.loader}</div>}{loading?<div className="loading">Ищу на Modrinth…</div>:<div className="modGrid">{mods.map(m=><article className="modCard" key={m.project_id}><img src={m.icon_url || '/src/assets/icon.png'}/><div><h3>{m.title}</h3><p>{m.description || 'Без описания'}</p><small>↓ {m.downloads?.toLocaleString?.() || m.downloads || 0}</small></div><button disabled={busy} onClick={()=>install(m)}>＋</button></article>)}</div>}</section> }

function BuildModal({versions,initialVersion,onClose,onCreate}) { const [name,setName]=useState(''); const [version,setVersion]=useState(initialVersion || versions[0]?.id || ''); const [loader,setLoader]=useState('Vanilla'); return <div className="modalBack"><div className="modal"><button className="close" onClick={onClose}>×</button><span className="eyebrow">НОВАЯ СБОРКА</span><h2>Создать свою сборку</h2><label>Название<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Например, Sakura Survival"/></label><label>Версия Minecraft<select value={version} onChange={e=>setVersion(e.target.value)}>{versions.map(v=><option key={v.id}>{v.id}</option>)}{!versions.length&&<option>1.21.8</option>}</select></label><label>Загрузчик<select value={loader} onChange={e=>setLoader(e.target.value)}><option>Vanilla</option><option>Fabric</option><option>Forge</option><option>NeoForge</option><option>Quilt</option></select></label><button className="create" disabled={!name.trim()||!version} onClick={()=>onCreate({name,version,loader})}>Создать сборку</button></div></div> }
function Empty({title,text}) { return <div className="empty"><div className="emptyIcon">✦</div><h1>{title}</h1><p>{text}</p></div> }
function Settings({profile,reset,showPath}) { return <section className="settings"><div><span className="eyebrow">ПРОФИЛЬ</span><h1>{profile.nickname}</h1><p>Локальный автономный профиль Sakura Launcher.</p></div><button className="new" onClick={showPath}>Показать папку данных</button><button className="danger" onClick={reset}>Сбросить локальный профиль</button><div className="settingsNote">Microsoft-вход можно подключить отдельно. Автономный профиль не выдаёт доступ к купленному аккаунту и не является обходом авторизации Minecraft.</div></section> }

createRoot(document.getElementById('root')).render(<App/>);
