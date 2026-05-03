import type { Metadata } from "next";
import { ResumeIntake } from "@/components/evaluate/ResumeIntake";

export const metadata: Metadata = {
  title: "Resume intake — iCareerOS",
  description: "Build your career profile by uploading a resume or filling in the form manually.",
};

export default function ResumeIntakePage() {
  return <ResumeIntake />;
}
