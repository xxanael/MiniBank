import React from "react";

export const OrangeMoneyLogo: React.FC<{ size?: number }> = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" rx="22" fill="#FF7900" />
    <circle cx="50" cy="38" r="19" stroke="#FFFFFF" strokeWidth="6.5" fill="none" />
    <circle cx="50" cy="38" r="6.5" fill="#FFFFFF" />
    <rect x="15" y="62" width="70" height="24" rx="6" fill="#000000" />
    <text x="50" y="79" fill="#FFFFFF" fontSize="12" fontWeight="900" fontFamily="Arial, Helvetica, sans-serif" textAnchor="middle" letterSpacing="0.8">
      MONEY
    </text>
  </svg>
);

export const MtnMoMoLogo: React.FC<{ size?: number }> = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" rx="22" fill="#FFCC00" />
    <ellipse cx="50" cy="36" rx="34" ry="19" fill="none" stroke="#000000" strokeWidth="5.5" />
    <text x="50" y="43" fill="#000000" fontSize="21" fontWeight="900" fontStyle="italic" fontFamily="Arial, Helvetica, sans-serif" textAnchor="middle">
      MTN
    </text>
    <rect x="18" y="62" width="64" height="24" rx="12" fill="#004F9E" />
    <text x="50" y="79" fill="#FFFFFF" fontSize="13" fontWeight="900" fontFamily="Arial, Helvetica, sans-serif" textAnchor="middle" letterSpacing="0.5">
      MoMo
    </text>
  </svg>
);

export const WaveLogo: React.FC<{ size?: number }> = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" rx="22" fill="#1EA7FD" />
    {/* Le célèbre manchot de Wave */}
    <ellipse cx="50" cy="52" rx="26" ry="30" fill="#0A1128" />
    <ellipse cx="50" cy="56" rx="17" ry="22" fill="#FFFFFF" />
    <circle cx="43" cy="38" r="4.5" fill="#FFFFFF" />
    <circle cx="43" cy="38" r="2.2" fill="#000000" />
    <circle cx="57" cy="38" r="4.5" fill="#FFFFFF" />
    <circle cx="57" cy="38" r="2.2" fill="#000000" />
    <polygon points="50,42 44,48 56,48" fill="#FF9F1C" />
    <polygon points="43,53 57,53 50,56" fill="#E63946" />
    <polygon points="43,59 57,59 50,56" fill="#E63946" />
    <circle cx="50" cy="56" r="2.5" fill="#FFD166" />
  </svg>
);

export const MoovMoneyLogo: React.FC<{ size?: number }> = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" rx="22" fill="#005DAA" />
    <path d="M22 66 C35 30, 65 30, 78 66" stroke="#FF6600" strokeWidth="8" strokeLinecap="round" fill="none" />
    <text x="50" y="47" fill="#FFFFFF" fontSize="19" fontWeight="900" fontFamily="Arial, Helvetica, sans-serif" textAnchor="middle" letterSpacing="-0.5">
      moov
    </text>
    <rect x="20" y="65" width="60" height="20" rx="10" fill="#FF6600" />
    <text x="50" y="79" fill="#FFFFFF" fontSize="10" fontWeight="900" fontFamily="Arial, Helvetica, sans-serif" textAnchor="middle" letterSpacing="0.5">
      MONEY
    </text>
  </svg>
);
