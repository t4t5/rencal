type CloudIconProps = {
  className?: string
  isLoading?: boolean
}

export const CloudIcon = ({ className, isLoading = false }: CloudIconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 17 13" className={className}>
    <path
      d="M0.681885 7.5C0.681885 9.75934 2.51345 11.5909 4.77279 11.5909H12.2728C14.1556 11.5909 15.6819 10.0646 15.6819 8.18182C15.6819 6.29904 14.1556 4.77273 12.2728 4.77273C12.2728 2.51338 10.4412 0.681816 8.18188 0.681816C6.39123 0.681816 4.86927 1.83231 4.31489 3.43443C2.27107 3.66206 0.681885 5.39543 0.681885 7.5Z"
      pathLength={100}
      stroke="currentColor"
      strokeDasharray={isLoading ? "82 14" : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.36364"
    >
      {isLoading && (
        <animate
          attributeName="stroke-dashoffset"
          dur="1s"
          from="0"
          repeatCount="indefinite"
          to="100"
        />
      )}
    </path>
  </svg>
)
