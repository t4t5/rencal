export const GoogleMeetIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 176 138" className={className}>
    <path
      fill="url(#google-meet-camera)"
      d="M102.015 81.88c-6.829-4.718-6.921-14.778-.179-19.62L157 22.643c7.94-5.701 19-.038 19 9.737v77.755c0 9.675-10.861 15.359-18.821 9.859z"
    />
    <path
      fill="url(#google-meet-body)"
      d="M0 44C0 19.7 19.7 0 44 0h64c11.046 0 20 8.954 20 20v98c0 11.046-8.954 20-20 20H20c-11.046 0-20-8.954-20-20z"
    />
    <mask id="google-meet-mask" width="129" height="138" x="8" y="27" maskUnits="userSpaceOnUse">
      <path
        fill="#fff"
        d="M8 71c0-24.3 19.7-44 44-44h64c11.046 0 20 8.954 20 20v98c0 11.046-8.954 20-20 20H28c-11.046 0-20-8.954-20-20z"
      />
    </mask>
    <g filter="url(#google-meet-blur)" mask="url(#google-meet-mask)" transform="translate(-8 -27)">
      <path fill="url(#google-meet-highlight)" d="M73.906 99.198 183.906 36v124z" />
    </g>
    <circle cx="30" cy="108" r="14" fill="#fff" />
    <defs>
      <linearGradient
        id="google-meet-camera"
        x1="128.8"
        x2="227.2"
        y1="104.44"
        y2="104.44"
        gradientUnits="userSpaceOnUse"
        gradientTransform="translate(-8 -27)"
      >
        <stop stopColor="#f6a100" />
        <stop offset="1" stopColor="#ffbe00" />
      </linearGradient>
      <linearGradient
        id="google-meet-highlight"
        x1="136.22"
        x2="78.5"
        y1="91.32"
        y2="91.19"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset=".15" stopColor="#ffb5e8" />
        <stop offset="1" stopColor="#ffdbf5" stopOpacity="0" />
      </linearGradient>
      <radialGradient
        id="google-meet-body"
        cx="0"
        cy="0"
        r="1"
        gradientTransform="matrix(-159.725 0 0 -135.852 152.325 69)"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset=".15" stopColor="#ffe921" />
        <stop offset="1" stopColor="#fec700" />
      </radialGradient>
      <filter
        id="google-meet-blur"
        width="166"
        height="180"
        x="45.91"
        y="8"
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        <feGaussianBlur result="effect1_foregroundBlur_37584_9338" stdDeviation="14" />
      </filter>
    </defs>
  </svg>
)
