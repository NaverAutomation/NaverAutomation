import React, { useState } from 'react';
import { supabase } from '../utils/supabase';

const Login = ({ onLogin }) => {
  console.log('[Login] Rendering Login component');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message || '로그인에 실패했습니다.');
      } else if (data.session) {
        onLogin();
      }
    } catch (err) {
      setError('서버 연결 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200">
      <div className="card w-96 bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-4xl">🚀</span>
            <h2 className="card-title text-2xl font-bold text-primary">Naver Auto</h2>
          </div>
          <p className="text-center text-base-content/60 mb-6">서비스 이용을 위해 로그인해주세요.</p>
          
          <form onSubmit={handleSubmit}>
            <div className="form-control">
              <label className="label">
                <span className="label-text">이메일</span>
              </label>
              <input 
                type="email" 
                placeholder="이메일을 입력하세요" 
                className="input input-bordered" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
              />
            </div>
            
            <div className="form-control mt-4">
              <label className="label">
                <span className="label-text">비밀번호</span>
              </label>
              <input 
                type="password" 
                placeholder="비밀번호를 입력하세요" 
                className="input input-bordered" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
              />
            </div>
            
            {error && (
              <div className="alert alert-error mt-4 py-2 px-4 text-sm font-semibold">
                <span>{error}</span>
              </div>
            )}
            
            <div className="form-control mt-8">
              <button 
                type="submit" 
                className={`btn btn-primary w-full ${loading ? 'loading' : ''}`}
                disabled={loading}
              >
                {loading ? '로그인 중...' : '로그인'}
              </button>
            </div>
          </form>
          
          <div className="mt-6 text-xs text-center text-base-content/40">
            관리자 계정으로만 접속 가능합니다.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
