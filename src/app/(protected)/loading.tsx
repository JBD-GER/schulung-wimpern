export default function ProtectedLoading() {
  return (
    <div
      className="mx-auto max-w-6xl animate-pulse"
      aria-label="Inhalt wird geladen"
      role="status"
    >
      <div className="h-3 w-32 rounded-full bg-beige" />
      <div className="mt-5 h-11 max-w-xl rounded-xl bg-beige/80" />
      <div className="mt-4 h-5 max-w-2xl rounded-full bg-beige/60" />
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        <div className="h-40 rounded-2xl bg-white" />
        <div className="h-40 rounded-2xl bg-white" />
        <div className="h-40 rounded-2xl bg-white" />
      </div>
      <span className="sr-only">Bitte warten.</span>
    </div>
  );
}
