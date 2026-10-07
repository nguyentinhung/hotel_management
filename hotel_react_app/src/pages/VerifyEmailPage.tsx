import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../services/authService';
import { useToast } from '../components/ToastProvider';

export default function VerifyEmailPage() {
    const { showToast } = useToast();
    const [searchParams] = useSearchParams();
    const [message, setMessage] = useState('Đang xác thực email...');
    const [success, setSuccess] = useState(false);

    const verifiedRef = useRef(false);

    useEffect(() => {
        if (verifiedRef.current) return;

        const token = searchParams.get('token');

        if (!token) {
            const errorMessage = 'Liên kết xác thực không hợp lệ.';
            setMessage(errorMessage);
            showToast(errorMessage, 'error');
            return;
        }

        verifiedRef.current = true;

        verifyEmail(token)
            .then((response) => {
                setSuccess(true);
                setMessage(response.message);
                showToast(response.message, 'success');
            })
            .catch((error) => {
                setSuccess(false);
                const errorMessage = error instanceof Error ? error.message : 'Xác thực email thất bại.';
                setMessage(errorMessage);
                showToast(errorMessage, 'error');
            });
    }, [searchParams]);

    return (
        <div className="login-page">
            <div className="login-box">
                <div className="login-form-wrap">
                    <div className="login-form">
                        <h1>Xác thực email</h1>

                        <p className={success ? 'success-text' : 'error-text'}>
                            {message}
                        </p>

                        {success && (
                            <Link to="/login" className="primary-btn">
                                Đăng nhập
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
