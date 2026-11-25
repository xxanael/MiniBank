declare module 'lucide-react' {
  import * as React from 'react';
  export interface IconProps extends React.SVGProps<SVGSVGElement> {
    size?: string | number;
    color?: string;
    strokeWidth?: string | number;
  }
  export type Icon = React.FC<IconProps>;
  export const Wallet: Icon;
  export const ArrowUpRight: Icon;
  export const ArrowDownLeft: Icon;
  export const Smartphone: Icon;
  export const Shield: Icon;
  export const Eye: Icon;
  export const EyeOff: Icon;
  export const Copy: Icon;
  export const Check: Icon;
  export const Send: Icon;
  export const Plus: Icon;
  export const Trash2: Icon;
  export const Printer: Icon;
  export const X: Icon;
  export const Lock: Icon;
  export const LogOut: Icon;
  export const Bell: Icon;
  export const Search: Icon;
  export const CheckCircle2: Icon;
  export const AlertTriangle: Icon;
  export const CreditCard: Icon;
  export const Building: Icon;
  export const Activity: Icon;
}
