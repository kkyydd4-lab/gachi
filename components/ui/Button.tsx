import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    fullWidth?: boolean;
    isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    isLoading = false,
    className = '',
    disabled,
    ...props
}) => {
    const baseStyles = 'inline-flex items-center justify-center rounded-2xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]';

    const variants = {
        primary: 'bg-primary text-white shadow-lg shadow-primary/30 hover:brightness-110',
        secondary: 'bg-secondary text-white shadow-lg shadow-secondary/30 hover:brightness-110',
        outline: 'border-2 border-gray-200 text-gray-600 hover:border-primary hover:text-primary bg-white',
        ghost: 'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
    };

    const sizes = {
        sm: 'px-4 py-2 text-sm',
        md: 'px-6 py-3 text-base',
        lg: 'px-8 py-4 text-lg',
    };

    const width = fullWidth ? 'w-full' : '';

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${width} ${className}`}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading ? (
                <>
                    <span className="material-symbols-outlined animate-spin mr-2 text-xl">refresh</span>
                    Locading...
                </>
            ) : (
                children
            )}
        </button>
    );
};
