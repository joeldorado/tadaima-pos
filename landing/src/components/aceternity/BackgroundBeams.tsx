import { useId, useMemo } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

/**
 * Aceternity-style Background Beams.
 *
 * SVG paths con gradientes animados que dan efecto de rayos/aurora detrás del
 * contenido. Pointer-events-none → no interfiere con la UI.
 *
 * Customizado al theme Tadaima: gradiente termina en `--td-red` (#E0221A).
 * Tres tonos rotando lentamente para que se sienta vivo sin distraer.
 *
 * Uso: poner ABSOLUTE detrás del contenido (parent debe ser relative).
 */
export function BackgroundBeams({ className }: { className?: string }) {
  const id = useId()

  // Genero 32 paths con offset → líneas casi paralelas que se cruzan en arco.
  // El offset escalonado da la sensación de "lluvia de rayos" típica de
  // Aceternity sin tener que hardcodear cada path.
  const paths = useMemo(
    () =>
      Array.from({ length: 32 }, (_, i) => {
        const offset = i * 6
        return `M${-380 + offset} ${-189 + offset}C${-380 + offset} ${
          -189 + offset
        } ${-312 + offset} ${216 + offset} ${152 + offset} ${343 + offset}C${
          616 + offset
        } ${470 + offset} ${684 + offset} ${875 + offset} ${684 + offset} ${
          875 + offset
        }`
      }),
    [],
  )

  return (
    <div
      className={cn(
        'absolute inset-0 overflow-hidden pointer-events-none z-0',
        className,
      )}
    >
      <svg
        className="z-0 h-full w-full"
        width="100%"
        height="100%"
        viewBox="0 0 696 316"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>Background Paths</title>
        {paths.map((d, index) => (
          <motion.path
            key={`path-${index}`}
            d={d}
            stroke={`url(#linearGradient-${id}-${index})`}
            strokeOpacity="0.35"
            strokeWidth="0.6"
          />
        ))}
        <defs>
          {paths.map((_, index) => (
            <motion.linearGradient
              id={`linearGradient-${id}-${index}`}
              key={`grad-${index}`}
              initial={{ x1: '0%', x2: '0%', y1: '0%', y2: '0%' }}
              animate={{
                x1: ['0%', `${93 + Math.random() * 8}%`],
                x2: ['0%', `${95 + Math.random() * 4}%`],
                y1: ['0%', `${93 + Math.random() * 8}%`],
                y2: ['0%', `${98 + Math.random() * 2}%`],
              }}
              transition={{
                duration: Math.random() * 10 + 10,
                ease: 'easeInOut',
                repeat: Infinity,
                delay: Math.random() * 10,
              }}
            >
              <stop stopColor="#E0221A" stopOpacity="0" />
              <stop offset="0.5" stopColor="#E0221A" />
              <stop offset="1" stopColor="#fb923c" stopOpacity="0" />
            </motion.linearGradient>
          ))}
        </defs>
      </svg>
    </div>
  )
}
