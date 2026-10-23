import { useParams } from "react-router-dom";
import BookingPage from "./BookingPage";
export default function PublicBookingPage() {
  const { slug } = useParams();
  return <BookingPage key={slug} />;
}
