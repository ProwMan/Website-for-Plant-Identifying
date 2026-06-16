import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Camera,
  Leaf,
  Trophy,
  Shield,
  ChevronLeft,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  User as UserIcon,
  GraduationCap,
  Heart,
  Info,
  MessageSquare,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  identifyPlantClient,
  loginUserClient,
  type PlantSuggestion,
} from "@/lib/api/identify.functions";

import { auth, db } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { collection, addDoc, onSnapshot, query, orderBy, limit, doc, setDoc } from "firebase/firestore";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "ACS(I) Plant Spotter" }],
  }),
  component: Index,
});

type Phase =
  | "login"
  | "menu"
  | "camera"
  | "identifying"
  | "results"
  | "leaderboard"
  | "badges"
  | "credits"
  | "error";

type Discovery = {
  id: string;
  student: string;
  scientificName: string;
  commonName: string;
  points: number;
  confidence: number;
  foundAt: string;
  userId: string;
};

const ACSI_LAT = 1.3001;
const ACSI_LNG = 103.7812;

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// --- Sub-components ---

function PageContainer({
  children,
  phase,
  setPhase,
  showHeader = true,
  backTo,
  studentName,
  userPoints,
  title,
  isVerified,
  onLogout,
}: {
  children: React.ReactNode;
  phase: Phase;
  setPhase: (p: Phase) => void;
  showHeader?: boolean;
  backTo?: Phase;
  studentName: string;
  userPoints: number;
  title?: string;
  isVerified: boolean;
  onLogout?: () => void;
}) {
  return (
    <div className="min-h-screen triangle-bg flex flex-col items-center overflow-hidden font-sans">
      {showHeader && (
        <header className="w-full max-w-md px-6 pt-10 pb-6 bg-transparent sticky top-0 z-20">
          <div className="flex items-center justify-between mb-4">
            {backTo ? (
              <button
                onClick={() => setPhase(backTo)}
                className="text-white bg-black/20 backdrop-blur-lg p-1.5 rounded-full active:scale-90 transition-transform border border-white/10"
              >
                <ChevronLeft className="h-6 w-6 stroke-[3]" />
              </button>
            ) : (
              <div className="flex items-center gap-4">
                <img
                  src="/efg-logo.png"
                  className="h-16 w-16 object-contain drop-shadow-xl"
                  alt="EFG Logo"
                />
                <div className="flex flex-col">
                  <h1 className="text-[10px] font-bold text-[color:var(--acs-gold)] tracking-[0.2em] uppercase">
                    EFG App
                  </h1>
                  <h2 className="text-2xl font-black text-white leading-tight">ACS Independent</h2>
                </div>
              </div>
            )}
            {studentName && (
              <div className="text-right flex flex-col items-end">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{studentName}</span>
                  <button
                    onClick={onLogout}
                    className="text-white/40 hover:text-white transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div
                    className={`flex items-center gap-1 text-[8px] font-bold px-2 py-0.5 rounded-full border ${isVerified ? "text-emerald-400 border-emerald-400 bg-emerald-400/10" : "text-red-400 border-red-400 bg-red-400/10"}`}
                  >
                    {isVerified ? "Area Verified" : "Outside Area"}
                  </div>
                  <div className="text-[10px] font-bold text-[color:var(--acs-gold)] flex items-center gap-1">
                    {userPoints} <Trophy className="h-3 w-3 fill-current" />
                  </div>
                </div>
              </div>
            )}
          </div>
          {title && (
            <h2 className="text-3xl font-black text-white drop-shadow-md">{title}</h2>
          )}
        </header>
      )}
      <div className="w-full max-w-md flex-1 flex flex-col relative px-6 overflow-y-auto no-scrollbar">
        {children}
      </div>
    </div>
  );
}

// --- Main Component ---

function Index() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [phase, setPhase] = useState<Phase>("login");

  // Auth Form State
  const [fullName, setFullName] = useState("");
  const [className, setClassName] = useState("");
  const [authError, setAuthError] = useState("");

  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PlantSuggestion[]>([]);
  const [mocked, setMocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [lastAward, setLastAward] = useState<number | null>(null);
  const [statusOverlay, setStatusOverlay] = useState<"found" | "discovered" | null>(null);

  const [locationVerified, setLocationVerified] = useState(false);
  const isVerified = locationVerified;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setPhase(firebaseUser ? "menu" : "login");
    });
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "discoveries"), orderBy("foundAt", "desc"), limit(100));
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Discovery);
      setDiscoveries(docs);
    });
    return unsub;
  }, []);

  const leaderboardData = useMemo(() => {
    const totals = discoveries.reduce<Record<string, number>>((acc, discovery) => {
      acc[discovery.student] = (acc[discovery.student] ?? 0) + discovery.points;
      return acc;
    }, {});
    const sorted = Object.entries(totals)
      .map(([student, points]) => ({ student, points }))
      .filter((e) => e.points > 0)
      .sort((a, b) => b.points - a.points);
    const top3 = sorted.slice(0, 3);
    const userIndex = sorted.findIndex((e) => e.student === (user?.displayName || ""));
    return { top3, userStanding: userIndex + 1, userPoints: totals[user?.displayName || ""] || 0 };
  }, [discoveries, user]);

  const userBadges = useMemo(() => {
    const unique = new Map();
    discoveries
      .filter((d) => d.userId === user?.uid)
      .forEach((d) => {
        if (!unique.has(d.scientificName)) unique.set(d.scientificName, d);
      });
    return Array.from(unique.values());
  }, [discoveries, user]);

  async function handleAuth() {
    setAuthError("");
    if (!fullName.trim() || !className.trim()) {
      setAuthError("Please fill in both fields");
      return;
    }
    try {
      const { uid, displayName } = await loginUserClient(fullName, className);
      const email = `${uid}@placeholder.com`;
      const password = `replace-this-with-a-secure-password`;

      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (signInErr: any) {
        if (
          signInErr.code === "auth/user-not-found" ||
          signInErr.code === "auth/invalid-credential" ||
          signInErr.code === "auth/invalid-email"
        ) {
          const userCred = await createUserWithEmailAndPassword(auth, email, password);
          await updateProfile(userCred.user, { displayName });
        } else {
          throw signInErr;
        }
      }

      await setDoc(
        doc(db, "users", uid),
        {
          fullName: fullName.trim(),
          className: className.trim(),
          lastLogin: new Date().toISOString(),
        },
        { merge: true },
      );
    } catch (err: any) {
      setAuthError(err.message);
    }
  }

  async function handleLogout() {
    await signOut(auth);
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startCamera() {
    setError(null);
    setPhase("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
        videoRef.current?.play();
      }, 200);
    } catch {
      setPhase("error");
    }
  }

  async function checkVerification() {
    if (typeof window === "undefined") return;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const dist = getDistance(pos.coords.latitude, pos.coords.longitude, ACSI_LAT, ACSI_LNG);
          const ok = dist <= 0.5;
          setLocationVerified(ok);
          if (!ok) {
            alert(`Outside Area: You are ${dist.toFixed(2)}km away. Please be within 0.5km of ACS Independent.`);
          } else {
            alert("Location Verified! You are within the school area.");
          }
        },
        () => {
          setLocationVerified(false);
          alert("Location Error: Please enable GPS/Location access to verify you are in school.");
        },
        { timeout: 5000 },
      );
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video) return;

    if (typeof window === "undefined") return;

    // Automatic Location verification (0.5km)
    const checkLoc = () =>
      new Promise<boolean>((resolve) => {
        if (!navigator.geolocation) return resolve(false);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const dist = getDistance(pos.coords.latitude, pos.coords.longitude, ACSI_LAT, ACSI_LNG);
            const ok = dist <= 0.5;
            if (!ok) {
              alert(`Action Blocked: You must be within 0.5km of ACS Independent to identify plants. Current distance: ${dist.toFixed(2)}km`);
            }
            resolve(ok);
          },
          () => {
            alert("Action Blocked: Location access is required to verify you are in school.");
            resolve(false);
          },
          { timeout: 5000 },
        );
      });

    const isLocOk = await checkLoc();
    if (!isLocOk) {
      setLocationVerified(false);
      setPhase("menu");
      stopCamera();
      return;
    }
    setLocationVerified(true);

    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    canvas
      .getContext("2d")
      ?.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, 1024, 1024);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setSnapshot(dataUrl);
    stopCamera();
    setPhase("identifying");
    try {
      const result = await identifyPlantClient(dataUrl);
      setSuggestions(result.suggestions);
      setMocked(false);
      setPhase("results");
    } catch {
      setPhase("error");
    }
  }

  async function confirmDiscovery(suggestion: PlantSuggestion) {
    if (!user) return;
    const foundBefore = discoveries.some(
      (d) =>
        d.userId === user.uid && d.scientificName.toLowerCase() === suggestion.name.toLowerCase(),
    );
    const points = foundBefore ? 1 : 10;
    await addDoc(collection(db, "discoveries"), {
      userId: user.uid,
      student: user.displayName || "Anonymous",
      scientificName: suggestion.name,
      commonName: suggestion.commonNames[0] || "Unknown",
      points,
      confidence: suggestion.probability,
      foundAt: new Date().toISOString(),
    });
    setLastAward(points);
    setStatusOverlay(foundBefore ? "found" : "discovered");
  }

  if (phase === "login") {
    return (
      <PageContainer
        phase={phase}
        setPhase={setPhase}
        showHeader={false}
        studentName=""
        userPoints={0}
        isVerified={false}
      >
        <div className="flex-1 flex flex-col justify-center items-center gap-8 py-10">
          <div className="flex flex-col items-center text-center">
            <img src="/efg-logo.png" className="h-64 w-64 object-contain mb-8 drop-shadow-2xl animate-bounce-slow" alt="EFG Logo" />
            <h1 className="text-4xl font-black tracking-tight text-white mb-1 drop-shadow-lg">EFG App</h1>
            <h2 className="text-sm font-bold text-[color:var(--acs-gold)] tracking-widest uppercase">
              Environment Focus Group
            </h2>
          </div>

          <div className="w-full space-y-4 liquid-glass p-8 rounded-[2.5rem] border-white/20 shadow-2xl">
            <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-4 text-center">
              Student Registration
            </div>

            <div className="relative group">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/20 group-focus-within:text-[color:var(--acs-gold)] transition-colors" />
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full Name"
                className="w-full bg-black/40 border border-white/10 rounded-2xl pl-12 pr-5 py-4 text-white font-semibold placeholder:text-white/20 outline-none focus:border-[color:var(--acs-gold)]/50 transition-all shadow-inner"
              />
            </div>

            <div className="relative group">
              <GraduationCap className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/20 group-focus-within:text-[color:var(--acs-gold)] transition-colors" />
              <input
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="Class (e.g. 1.01)"
                className="w-full bg-black/40 border border-white/10 rounded-2xl pl-12 pr-5 py-4 text-white font-semibold placeholder:text-white/20 outline-none focus:border-[color:var(--acs-gold)]/50 transition-all shadow-inner"
              />
            </div>

            {authError && (
              <p className="text-center text-[10px] font-bold text-red-400 bg-red-400/10 py-2 rounded-lg border border-red-400/20">
                {authError}
              </p>
            )}

            <button
              onClick={handleAuth}
              className="w-full bg-gradient-to-br from-[color:var(--acs-gold)] to-[#e5a500] text-[color:var(--acs-blue-dark)] font-black py-4.5 rounded-2xl shadow-xl active:scale-95 transition-all text-sm border-b-4 border-black/20"
            >
              Register & Start
            </button>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (phase === "menu") {
    return (
      <PageContainer
        phase={phase}
        setPhase={setPhase}
        studentName={user?.displayName || ""}
        userPoints={leaderboardData.userPoints}
        isVerified={isVerified}
        onLogout={handleLogout}
      >
        <div className="flex-1 flex flex-col justify-center gap-6 py-6">
          <button
            onClick={checkVerification}
            className={`liquid-glass p-6 rounded-[2rem] text-left active:scale-95 transition-all group border-l-4 ${isVerified ? "border-emerald-500/50" : "border-red-500/50"}`}
          >
            <div className={`flex items-center gap-3 mb-1 ${isVerified ? "text-emerald-400" : "text-red-400"}`}>
              {isVerified ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
              <span className="font-bold uppercase text-xs tracking-widest">
                {isVerified ? "Location Verified" : "Location Unverified"}
              </span>
            </div>
            <p className="text-[9px] font-medium text-white/40 uppercase leading-relaxed tracking-wider">
              {isVerified ? "You are within ACS Independent" : "Tap to verify you are in school"}
            </p>
          </button>

          <button
            onClick={startCamera}
            className="liquid-glass-beige border-white/20 text-white font-black py-12 rounded-[3rem] flex flex-col items-center gap-4 active:scale-95 transition-all group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-black/10 pointer-events-none" />
            <div className="bg-black/40 p-6 rounded-full group-hover:scale-110 transition-transform shadow-xl border border-white/10">
              <Camera className="h-10 w-10 text-[color:var(--efg-beige)]" />
            </div>
            <span className="tracking-[0.1em] text-sm drop-shadow-lg font-black text-white">Identify Plant</span>
          </button>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setPhase("leaderboard")}
              className="liquid-glass-olive p-8 rounded-[2.5rem] flex flex-col items-center gap-3 active:scale-95 transition-all border-white/20 group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-black/10 pointer-events-none" />
              <Trophy className="h-6 w-6 text-[color:var(--efg-grey-olive)] group-hover:scale-110 transition-transform relative z-10" />
              <span className="text-[10px] font-black text-white relative z-10">
                Leaderboard
              </span>
            </button>
            <button
              onClick={() => setPhase("badges")}
              className="liquid-glass-gold p-8 rounded-[2.5rem] flex flex-col items-center gap-3 active:scale-95 transition-all border-white/20 group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-black/10 pointer-events-none" />
              <Shield className="h-6 w-6 text-[color:var(--acs-gold)] group-hover:scale-110 transition-transform relative z-10" />
              <span className="text-[10px] font-black text-white relative z-10">
                Collection
              </span>
            </button>
          </div>
          
          <button
            onClick={() => setPhase("credits")}
            className="mt-4 liquid-glass-blue p-5 rounded-[2rem] flex items-center justify-center gap-4 active:scale-95 transition-all border-white/10 group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-black/10 pointer-events-none" />
            <div className="bg-black/40 p-2.5 rounded-full group-hover:scale-110 transition-transform shadow-lg border border-white/10 relative z-10">
              <Info className="h-5 w-5 text-[color:var(--efg-grey-blue)]" />
            </div>
            <span className="text-[11px] font-black text-white tracking-widest relative z-10">
              App Credits & Feedback
            </span>
          </button>
        </div>
      </PageContainer>
    );
  }

  if (phase === "camera") {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
        <button
          onClick={() => {
            stopCamera();
            setPhase("menu");
          }}
          className="absolute top-10 left-8 text-white bg-black/40 backdrop-blur-lg p-2 rounded-full border border-white/10"
        >
          <ChevronLeft className="h-8 w-8 stroke-[3]" />
        </button>
        <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center">
          <button
            onClick={capture}
            className="h-20 w-20 rounded-full border-4 border-white flex items-center justify-center active:scale-90 shadow-2xl bg-white/20 backdrop-blur-sm"
          >
            <div className="h-16 w-16 rounded-full bg-white shadow-inner" />
          </button>
        </div>
      </div>
    );
  }

  if (phase === "identifying") {
    return (
      <PageContainer
        phase={phase}
        setPhase={setPhase}
        studentName={user?.displayName || ""}
        userPoints={leaderboardData.userPoints}
        isVerified={isVerified}
      >
        <div className="flex-1 flex flex-col justify-center items-center gap-8">
          <div className="relative">
             <div className="h-24 w-24 border-[6px] border-white/5 border-t-[color:var(--acs-gold)] rounded-full animate-spin" />
             <Leaf className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-[color:var(--acs-gold)] animate-pulse" />
          </div>
          <p className="font-bold tracking-[0.2em] text-[12px] text-white/40">
            Analyzing Flora...
          </p>
        </div>
      </PageContainer>
    );
  }

  if (phase === "results") {
    return (
      <PageContainer
        phase={phase}
        setPhase={setPhase}
        backTo="menu"
        studentName={user?.displayName || ""}
        userPoints={leaderboardData.userPoints}
        isVerified={isVerified}
        title="Matches"
      >
        <div className="flex-1 py-6 grid gap-4">
          {suggestions.map((s) => (
            <button
              key={s.name}
              onClick={() => confirmDiscovery(s)}
              className="liquid-glass p-5 text-left flex items-center gap-5 transition-all rounded-[2rem] border-white/10 group hover:border-[color:var(--acs-gold)]/30 shadow-xl"
            >
              <div className="flex-1">
                <h3 className="text-white font-bold italic text-lg leading-tight group-hover:text-[color:var(--acs-gold)] transition-colors">
                  {s.name}
                </h3>
                <p className="text-[color:var(--efg-grey-olive)] text-[11px] font-semibold mt-1.5">
                  {s.commonNames[0] || "Unknown"}
                </p>
                <div className="h-1.5 w-24 bg-black/40 rounded-full mt-4 overflow-hidden border border-white/5">
                  <div
                    className="h-full bg-gradient-to-r from-[color:var(--sage-green)] to-[color:var(--emerald-green)]"
                    style={{ width: `${s.probability * 100}%` }}
                  />
                </div>
              </div>
              {s.thumbnail && (
                <div className="relative h-20 w-20 rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl">
                   <img
                    src={s.thumbnail}
                    className="h-full w-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                  />
                </div>
              )}
            </button>
          ))}
        </div>
        {statusOverlay && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-8 bg-black/80 backdrop-blur-2xl">
            <div className="liquid-glass-dark border-4 border-[color:var(--acs-gold)]/30 rounded-[3.5rem] p-12 w-full flex flex-col items-center text-center shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="bg-gradient-to-br from-[color:var(--acs-gold)] to-[#e5a500] p-6 rounded-full mb-8 shadow-2xl">
                <ShieldCheck className="h-12 w-12 text-[color:var(--acs-blue-dark)]" />
              </div>
              <h2 className="text-4xl font-black text-white mb-2 tracking-tighter drop-shadow-lg">
                {statusOverlay === "found" ? "Logged" : "Discovery!"}
              </h2>
              <p className="text-[color:var(--acs-gold)] font-bold text-sm">
                +{lastAward} Points Earned
              </p>
              <button
                onClick={() => {
                  setStatusOverlay(null);
                  setPhase("menu");
                }}
                className="mt-12 w-full bg-white text-[color:var(--acs-blue-dark)] font-black px-12 py-5 rounded-2xl text-lg shadow-2xl active:scale-95 transition-all border-b-4 border-black/10"
              >
                Continue
              </button>
            </div>
          </div>
        )}
      </PageContainer>
    );
  }

  if (phase === "badges") {
    return (
      <PageContainer
        phase={phase}
        setPhase={setPhase}
        backTo="menu"
        studentName={user?.displayName || ""}
        userPoints={leaderboardData.userPoints}
        isVerified={isVerified}
        title="Collection"
      >
        <div className="flex-1 py-8 grid grid-cols-2 gap-x-8 gap-y-12 justify-items-center">
          {userBadges.map((b) => (
            <div key={b.id} className="flex flex-col items-center gap-4 text-center group">
              <div className="shield-badge shadow-2xl transition-transform group-active:scale-95">
                <Shield className="h-10 w-10 text-[color:var(--acs-gold)] drop-shadow-lg" />
              </div>
              <div className="px-2">
                <span className="text-[11px] font-bold text-white leading-tight block">
                  {b.scientificName}
                </span>
                <span className="text-[9px] font-medium text-[color:var(--efg-grey-olive)] mt-1.5 block">
                  {b.commonName}
                </span>
              </div>
            </div>
          ))}
        </div>
      </PageContainer>
    );
  }

  if (phase === "leaderboard") {
    return (
      <PageContainer
        phase={phase}
        setPhase={setPhase}
        backTo="menu"
        studentName={user?.displayName || ""}
        userPoints={leaderboardData.userPoints}
        isVerified={isVerified}
        title="Standing"
      >
        <div className="flex-1 flex flex-col gap-4 py-8">
          {leaderboardData.top3.map((e, idx) => (
            <div
              key={e.student}
              className={`liquid-glass px-8 py-6 rounded-[2.5rem] flex items-center justify-between group border-l-4 ${idx === 0 ? "border-[color:var(--acs-gold)]" : "border-white/5"}`}
            >
              <div className="flex items-center gap-6">
                <span
                  className={`text-2xl font-black ${idx === 0 ? "text-[color:var(--acs-gold)]" : "text-white/10"}`}
                >
                  #{idx + 1}
                </span>
                <span className="font-bold text-lg text-white group-hover:text-[color:var(--acs-gold)] transition-colors tracking-tight">
                  {e.student}
                </span>
              </div>
              <span className="font-bold text-sm text-[color:var(--acs-gold)] bg-black/20 px-4 py-1.5 rounded-full border border-white/5">
                {e.points} <span className="text-[10px] ml-0.5 font-bold">pts</span>
              </span>
            </div>
          ))}
        </div>
        <div className="mb-14 mt-auto p-8 liquid-glass-dark border-t-4 border-[color:var(--acs-gold)]/40 rounded-[3rem] shadow-2xl flex justify-between items-center bg-gradient-to-br from-black/60 to-transparent">
          <div className="flex items-center gap-5">
            <span className="text-2xl font-black text-[color:var(--acs-gold)] drop-shadow-lg">
              #{leaderboardData.userStanding || "-"}
            </span>
            <span className="font-bold text-lg text-white tracking-tighter drop-shadow-md">
              {user?.displayName}
            </span>
          </div>
          <span className="font-bold text-lg text-white bg-[color:var(--acs-gold)]/10 px-6 py-2 rounded-2xl border border-[color:var(--acs-gold)]/20 shadow-inner">
            {leaderboardData.userPoints} <span className="text-xs font-bold">pts</span>
          </span>
        </div>
      </PageContainer>
    );
  }

  if (phase === "credits") {
    return (
      <PageContainer
        phase={phase}
        setPhase={setPhase}
        backTo={user ? "menu" : "login"}
        studentName={user?.displayName || ""}
        userPoints={leaderboardData.userPoints}
        isVerified={isVerified}
        title="Credits"
      >
        <div className="flex-1 flex flex-col items-center justify-center py-10 gap-8">
           <div className="liquid-glass p-10 rounded-[3rem] w-full text-center border-white/20 shadow-2xl">
              <div className="bg-gradient-to-br from-[color:var(--acs-gold)] to-[#e5a500] p-6 rounded-full inline-block mb-6 shadow-xl">
                <Heart className="h-10 w-10 text-[color:var(--acs-blue-dark)]" />
              </div>
              
              <h3 className="text-2xl font-black text-white tracking-tighter mb-4">
                Done by Environment Focus Group
              </h3>
              
              <p className="text-sm font-medium text-white/60 leading-relaxed mb-8 px-4">
                This application was designed and developed by the Environment Focus Group (EFG) CCA at ACS Independent.
              </p>
              
              <div className="liquid-glass-dark p-6 rounded-2xl border-white/10">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <MessageSquare className="h-4 w-4 text-[color:var(--acs-gold)]" />
                  <span className="text-[11px] font-bold text-white uppercase tracking-widest">Feedback</span>
                </div>
                <p className="text-sm font-semibold text-[color:var(--acs-gold)]">
                  Contact Selvakumar Madhan via MS Teams
                </p>
              </div>
           </div>
           
           <div className="text-center space-y-2 opacity-30">
              <p className="text-[10px] font-bold tracking-widest uppercase">ACS Independent • 2026</p>
              <img src="/efg-logo.png" className="h-10 w-10 grayscale mx-auto" alt="Logo" />
           </div>
        </div>
      </PageContainer>
    );
  }

  return null;
}
