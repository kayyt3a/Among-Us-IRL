/** The brand mark: a party mask, for a game about hidden identities at a real party. */
export default function Logo({ size = 72 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="IRL Impostor">
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c2030" />
          <stop offset="1" stopColor="#0b0d14" />
        </linearGradient>
        <linearGradient id="logo-mask" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff6275" />
          <stop offset="1" stopColor="#d91f38" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="63" height="63" rx="17" fill="url(#logo-bg)" stroke="rgba(255,255,255,0.1)" />
      <path
        fillRule="evenodd"
        fill="url(#logo-mask)"
        d="M32 24.5C39.5 20.5 49.5 20.2 53 25c2.6 3.6 1.8 10.4-2.4 14.6-4.3 4.3-11.6 4-15.1-.6L32 35.6 28.5 39c-3.5 4.6-10.8 4.9-15.1.6C9.2 35.4 8.4 28.6 11 25c3.5-4.8 13.5-4.5 21-.5ZM17.5 31.6c2.2-3.9 7.6-4 9.8 0-2.2 3-7.6 3-9.8 0Zm19.2 0c2.2-3.9 7.6-4 9.8 0-2.2 3-7.6 3-9.8 0Z"
      />
    </svg>
  );
}
