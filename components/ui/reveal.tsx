"use client";

import { motion } from "motion/react";
import React from "react";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function Reveal({
  children,
  d = 0,
  className,
}: {
  children: React.ReactNode;
  d?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.5, delay: d, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
