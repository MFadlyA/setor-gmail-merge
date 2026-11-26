import type { Metadata } from "next";
import { CheckerView } from "./checker-view";

export const metadata: Metadata = {
  title: "Checker Gmail",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CheckerPage() {
  return <CheckerView />;
}
