import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    icon?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, icon, className = '', ...props }, ref) => {
        return (
            <div className="w-full">
                {label && (
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                        {label}
                    </label>
                )}
                <div className="relative">
                    {icon && (
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                            {icon}
                        </span>
                    )}
                    <input
                        ref={ref}
                        className={`w-full bg-gray-50 border-2 rounded-2xl px-4 py-3 outline-none transition-all font-medium placeholder:text-gray-400
              ${icon ? 'pl-11' : ''}
              ${error
                                ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
                                : 'border-transparent focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10 hover:bg-gray-100'
                            }
              ${className}
            `}
                        {...props}
                    />
                </div>
                {error && (
                    <p className="mt-1 text-xs text-red-500 font-bold ml-1">{error}</p>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';
