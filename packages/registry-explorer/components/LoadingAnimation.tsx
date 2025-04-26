import { motion } from "framer-motion"

export const LoadingAnimation = () => {
  const containerVariants = {
    start: {
      transition: {
        staggerChildren: 0.2,
      },
    },
    end: {
      transition: {
        staggerChildren: 0.2,
      },
    },
  }

  const circleVariants = {
    start: {
      y: "0%",
      scale: 0.8,
      opacity: 0.7,
    },
    end: {
      y: "100%",
      scale: 1,
      opacity: 1,
    },
  }

  const circleTransition = {
    duration: 0.5,
    repeat: Infinity,
    repeatType: "reverse" as const,
    ease: "easeInOut",
  }

  return (
    <motion.div
      key="loading-animation"
      className="flex justify-center items-center space-x-3 h-16"
      variants={containerVariants}
      initial="start"
      animate="end"
    >
      <motion.span
        key={0}
        className="w-4 h-4 bg-[#4E3CD6] rounded-full"
        variants={circleVariants}
        transition={circleTransition}
      />
      <motion.span
        key={1}
        className="w-4 h-4 bg-[#6047D1] rounded-full"
        variants={circleVariants}
        transition={circleTransition}
      />
      <motion.span
        key={2}
        className="w-4 h-4 bg-[#855DC4] rounded-full"
        variants={circleVariants}
        transition={circleTransition}
      />
      <motion.span
        key={3}
        className="w-4 h-4 bg-[#A872B7] rounded-full"
        variants={circleVariants}
        transition={circleTransition}
      />
    </motion.div>
  )
}
