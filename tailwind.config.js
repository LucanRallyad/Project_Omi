/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#F5F0E8",
        blush: "#F4C2C2",
        rose: "#D4849A",
        espresso: "#3D2B1F",
        gold: "#C9A961",
        petal: "#F9E4E9",
        charcoal: "#1A1615",
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', "Georgia", "serif"],
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 20px 50px -12px rgba(61, 43, 31, 0.35), 0 8px 20px -8px rgba(61, 43, 31, 0.25)",
        soft: "0 10px 30px -10px rgba(61, 43, 31, 0.25)",
        glow: "0 0 40px -5px rgba(212, 132, 154, 0.6)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "gradient-drift": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        shimmer: "shimmer 1.8s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        "gradient-drift": "gradient-drift 18s ease infinite",
      },
    },
  },
  plugins: [],
};
