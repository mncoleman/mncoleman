export function ResumeIcon({
  className,
  size = 40,
  strokeWidth = 1.5,
  ...props
}: React.SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <rect x="4" y="2" width="16" height="20" rx="2.5" ry="2.5" />
      <text
        x="12"
        y="8.5"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize="5"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        MC
      </text>
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="15" x2="16" y2="15" />
      <line x1="8" y1="18" x2="13" y2="18" />
    </svg>
  );
}
