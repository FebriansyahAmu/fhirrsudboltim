import LoginBrandPanel from "./components/Login/LoginBrandPanel";
import LoginFooter from "./components/Login/LoginFooter";
import LoginForm from "./components/Login/LoginForm";
import LoginHeader from "./components/Login/LoginHeader";

export default function Home() {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.1fr_1fr]">
      <LoginBrandPanel />

      <div className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <LoginHeader />
          <LoginForm />
          <LoginFooter />
        </div>
      </div>
    </main>
  );
}
