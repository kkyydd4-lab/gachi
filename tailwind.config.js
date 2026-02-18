/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./hooks/**/*.{js,ts,jsx,tsx}",
        "./services/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                primary: "#2CC9C2", // B.I. Main Mint
                secondary: "#FF7A00", // B.I. Point Orange
                navy: "#002B5B", // B.I. Sub Navy
                "background-light": "#F8FAFC",
            },
            fontFamily: {
                display: ["Lexend", "Noto Sans KR", "sans-serif"]
            },
            keyframes: {
                float: {
                    '0%': { transform: 'translateY(0px)' },
                    '50%': { transform: 'translateY(-15px)' },
                    '100%': { transform: 'translateY(0px)' },
                }
            },
            animation: {
                float: 'float 4s ease-in-out infinite',
            }
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
        require('@tailwindcss/container-queries'),
    ],
}
